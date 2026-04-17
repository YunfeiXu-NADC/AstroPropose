#!/usr/bin/env python3

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

import websocket


HELPERS_JS = r"""
(() => {
  if (window.__astroproposeHelpers) {
    return true;
  }

  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();

  const setNativeValue = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, value);
      return;
    }
    element.value = value;
  };

  const dispatchInputEvents = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const findLabel = (labelText) => {
    return Array.from(document.querySelectorAll('label')).find((label) =>
      normalize(label.textContent).includes(labelText)
    );
  };

  const controlForLabel = (labelText) => {
    const label = findLabel(labelText);
    if (!label) {
      return null;
    }

    if (label.htmlFor) {
      const element = document.getElementById(label.htmlFor);
      if (element) {
        return element;
      }
    }

    return (
      label.querySelector('input, textarea, select, button') ||
      label.parentElement?.querySelector('input, textarea, select, button') ||
      label.closest('div')?.querySelector('input, textarea, select, button') ||
      null
    );
  };

  const findButton = (text) => {
    return Array.from(document.querySelectorAll('button')).find((button) =>
      normalize(button.textContent).includes(text)
    );
  };

  const findLink = (text) => {
    return Array.from(document.querySelectorAll('a')).find((link) =>
      normalize(link.textContent).includes(text)
    );
  };

  const findByText = (selector, text) => {
    return Array.from(document.querySelectorAll(selector)).find((node) =>
      normalize(node.textContent).includes(text)
    );
  };

  window.__astroproposeHelpers = {
    bodyText() {
      return normalize(document.body.innerText);
    },
    path() {
      return location.pathname;
    },
    hasText(text) {
      return normalize(document.body.innerText).includes(text);
    },
    setByLabel(labelText, value) {
      const control = controlForLabel(labelText);
      if (!control) {
        return false;
      }
      control.focus();
      setNativeValue(control, value);
      dispatchInputEvents(control);
      return true;
    },
    setByPlaceholder(placeholderText, value) {
      const control = Array.from(document.querySelectorAll('input, textarea')).find((element) =>
        (element.getAttribute('placeholder') || '').includes(placeholderText)
      );
      if (!control) {
        return false;
      }
      control.focus();
      setNativeValue(control, value);
      dispatchInputEvents(control);
      return true;
    },
    selectByLabel(labelText, optionText) {
      const control = controlForLabel(labelText);
      if (!control || control.tagName !== 'SELECT') {
        return false;
      }
      const option = Array.from(control.options).find((candidate) =>
        normalize(candidate.textContent).includes(optionText)
      );
      if (!option) {
        return false;
      }
      setNativeValue(control, option.value);
      control.dispatchEvent(new Event('change', { bubbles: true }));
      control.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    },
    clickButton(text) {
      const button = findButton(text);
      if (!button) {
        return false;
      }
      button.click();
      return true;
    },
    clickLink(text) {
      const link = findLink(text);
      if (!link) {
        return false;
      }
      link.click();
      return true;
    },
    clickNode(text) {
      const node = findByText('.react-flow__node', text);
      if (!node) {
        return false;
      }
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      node.click();
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    },
    fillCurrentFieldEditor(fieldName, displayLabel) {
      const fieldNameInput = controlForLabel('Field Name');
      const displayLabelInput = controlForLabel('Display Label');
      if (!fieldNameInput || !displayLabelInput) {
        return false;
      }
      setNativeValue(fieldNameInput, fieldName);
      dispatchInputEvents(fieldNameInput);
      setNativeValue(displayLabelInput, displayLabel);
      dispatchInputEvents(displayLabelInput);
      return true;
    },
    clickInstrument(nameOrCode) {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
        normalize(candidate.textContent).includes(nameOrCode)
      );
      if (!button) {
        return false;
      }
      button.click();
      return true;
    },
    proposalRowText(title) {
      const listItem = Array.from(document.querySelectorAll('li, div, tr')).find((node) =>
        normalize(node.textContent).includes(title)
      );
      return listItem ? normalize(listItem.textContent) : '';
    },
  };

  return true;
})()
"""


class RegressionError(RuntimeError):
    pass


class CDPPage:
    def __init__(self, websocket_url: str):
        self.websocket = websocket.create_connection(websocket_url, timeout=10)
        self.websocket.settimeout(10)
        self.next_id = 0
        self.events = []
        self.command("Page.enable")
        self.command("Runtime.enable")

    def close(self):
        try:
            self.websocket.close()
        except Exception:
            pass

    def command(self, method, params=None, timeout=10):
        self.next_id += 1
        message_id = self.next_id
        payload = {"id": message_id, "method": method, "params": params or {}}
        self.websocket.send(json.dumps(payload))
        deadline = time.time() + timeout

        while time.time() < deadline:
            raw = self.websocket.recv()
            message = json.loads(raw)
            if message.get("id") == message_id:
                if "error" in message:
                    raise RegressionError(f"CDP error for {method}: {message['error']}")
                return message.get("result", {})
            self.events.append(message)

        raise RegressionError(f"Timed out waiting for CDP response: {method}")

    def wait_for_event(self, method, timeout=10):
        deadline = time.time() + timeout
        while time.time() < deadline:
            for index, event in enumerate(self.events):
                if event.get("method") == method:
                    return self.events.pop(index)
            try:
                raw = self.websocket.recv()
            except Exception:
                continue
            self.events.append(json.loads(raw))
        raise RegressionError(f"Timed out waiting for event: {method}")

    def navigate(self, url):
        self.command("Page.navigate", {"url": url})
        self.wait_for_event("Page.loadEventFired", timeout=15)
        self.evaluate(HELPERS_JS)

    def evaluate(self, expression, await_promise=True):
        result = self.command(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": await_promise,
                "returnByValue": True,
            },
            timeout=20,
        )
        if "exceptionDetails" in result:
            raise RegressionError(f"JavaScript evaluation failed: {result['exceptionDetails']}")
        return result.get("result", {}).get("value")

    def call_helper(self, method, *args):
        serialized = ", ".join(json.dumps(arg, ensure_ascii=False) for arg in args)
        return self.evaluate(f"window.__astroproposeHelpers.{method}({serialized})")

    def wait_until(self, description, predicate_js, timeout=20, interval=0.2):
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = self.evaluate(f"Boolean({predicate_js})")
            if value:
                return
            time.sleep(interval)
        raise RegressionError(f"Timed out waiting for: {description}")

    def capture_dom(self, output_path: Path):
        html = self.evaluate("document.documentElement.outerHTML")
        output_path.write_text(html, encoding="utf-8")

    def wait_for_helper_truthy(self, description, method, *args, timeout=20, interval=0.2):
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = self.call_helper(method, *args)
            if value:
                return value
            time.sleep(interval)
        raise RegressionError(f"Timed out waiting for helper condition: {description}")


class ChromeRunner:
    def __init__(self, debug_port: int):
        self.debug_port = debug_port
        self.user_data_dir = Path(tempfile.mkdtemp(prefix="astropropose-ui-"))
        self.process = None

    def start(self):
        command = [
            "google-chrome",
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={self.debug_port}",
            f"--user-data-dir={self.user_data_dir}",
            "about:blank",
        ]
        self.process = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{self.debug_port}/json/version"
                ) as response:
                    return json.loads(response.read().decode())["Browser"]
            except Exception:
                time.sleep(0.2)

        raise RegressionError("Chrome remote debugging endpoint did not start in time")

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        shutil.rmtree(self.user_data_dir, ignore_errors=True)

    def new_page(self, url):
        quoted = urllib.parse.quote(url, safe="")
        target = None
        last_error = None
        for method in ("PUT", "POST", "GET"):
          request = urllib.request.Request(
              f"http://127.0.0.1:{self.debug_port}/json/new?{quoted}",
              method=method,
          )
          try:
              with urllib.request.urlopen(request, timeout=10) as response:
                  target = json.loads(response.read().decode())
                  break
          except Exception as exc:
              last_error = exc
        if target is None:
            raise RegressionError(f"Unable to create a Chrome target: {last_error}")
        return CDPPage(target["webSocketDebuggerUrl"])


def assert_true(value, message):
    if not value:
        raise RegressionError(message)


def login(page: CDPPage, frontend_url: str, username: str, password: str):
    page.navigate(f"{frontend_url}/login")
    page.wait_until("login form", "window.__astroproposeHelpers.hasText('Login')")
    assert_true(page.call_helper("setByLabel", "Username", username), "Username input not found")
    assert_true(page.call_helper("setByLabel", "Password", password), "Password input not found")
    assert_true(page.call_helper("clickButton", "Sign in"), "Sign in button not found")
    page.wait_until("dashboard redirect", "window.__astroproposeHelpers.path() === '/dashboard'")


def open_path(page: CDPPage, frontend_url: str, path: str):
    page.navigate(f"{frontend_url}{path}")


def run_regression(frontend_url: str, artifact_dir: Path):
    timestamp = int(time.time())
    form_name = f"UI E2E Form {timestamp}"
    field_name = f"ui_field_{timestamp}"
    field_label = f"UI E2E Field {timestamp}"
    workflow_name = f"UI E2E Workflow {timestamp}"
    proposal_type_name = f"UI E2E Proposal Type {timestamp}"
    proposal_title = f"UI E2E Proposal {timestamp}"

    chrome = ChromeRunner(debug_port=9223)
    chrome.start()
    page = chrome.new_page(f"{frontend_url}/login")

    try:
        login(page, frontend_url, "admin", "password")

        open_path(page, frontend_url, "/admin/forms")
        page.wait_until("form management page", "window.__astroproposeHelpers.hasText('Form Template Management')")
        assert_true(page.call_helper("clickButton", "+ New Form"), "New Form button not found")
        page.wait_until("create form panel", "window.__astroproposeHelpers.hasText('Create New Form Template')")
        assert_true(
            page.call_helper("setByPlaceholder", "e.g., Imaging Observation Form", form_name),
            "Form name input not found",
        )
        assert_true(page.call_helper("clickButton", "+ Add Field"), "Add Field button not found")
        page.wait_until("field editor", "window.__astroproposeHelpers.hasText('Display Label')")
        assert_true(
            page.call_helper("fillCurrentFieldEditor", field_name, field_label),
            "Field editor inputs not found",
        )
        assert_true(page.call_helper("clickButton", "Create Form Template"), "Create Form Template button not found")
    except RegressionError:
        page.capture_dom(artifact_dir / "failure-admin-forms.html")
        page.close()
        chrome.stop()
        raise
    except Exception:
        page.capture_dom(artifact_dir / "failure-admin-forms.html")
        page.close()
        chrome.stop()
        raise

    # The forms page success text is dynamic; wait by checking the body text contains the form name.
    page.wait_until("form appears in page", f"window.__astroproposeHelpers.hasText({json.dumps(form_name)})")

    open_path(page, frontend_url, "/admin/workflows")
    page.wait_until("workflow management page", "window.__astroproposeHelpers.hasText('Workflow Management')")
    assert_true(page.call_helper("clickButton", "+ New Workflow"), "New Workflow button not found")
    assert_true(page.call_helper("setByLabel", "Workflow Name", workflow_name), "Workflow name input not found")
    assert_true(page.call_helper("setByLabel", "Description", "UI regression workflow"), "Workflow description input not found")
    assert_true(page.call_helper("clickButton", "Create Workflow"), "Create Workflow button not found")
    page.wait_until("workflow created", f"window.__astroproposeHelpers.hasText({json.dumps(workflow_name)})")
    assert_true(
        page.call_helper("selectByLabel", "Select a workflow to edit:", workflow_name),
        "Workflow selector did not contain the created workflow",
    )
    page.wait_until("workflow editor ready", "window.__astroproposeHelpers.hasText('Load Example Workflow')")
    assert_true(page.call_helper("clickButton", "Load Example Workflow"), "Load Example Workflow button not found")
    page.wait_until("draft node rendered", "window.__astroproposeHelpers.hasText('Draft')")
    assert_true(page.call_helper("clickNode", "Draft"), "Draft node not found")
    page.wait_until("node editor open", "window.__astroproposeHelpers.hasText('Associated Form Template')")
    page.wait_for_helper_truthy(
        "Associated Form Template contains the new form",
        "selectByLabel",
        "Associated Form Template",
        form_name,
        timeout=20,
    )
    assert_true(page.call_helper("clickButton", "Save Workflow"), "Save Workflow button not found")
    page.wait_until("workflow save success", "window.__astroproposeHelpers.hasText('Workflow saved successfully!')")

    open_path(page, frontend_url, "/admin/proposal-types")
    page.wait_until("proposal type page", "window.__astroproposeHelpers.hasText('Proposal Type Publishing')")
    assert_true(page.call_helper("clickButton", "+ Publish Workflow"), "Publish Workflow button not found")
    assert_true(
        page.call_helper("setByLabel", "Proposal Type Name", proposal_type_name),
        "Proposal type name input not found",
    )
    page.wait_for_helper_truthy(
        "Workflow select contains the new workflow",
        "selectByLabel",
        "Workflow",
        workflow_name,
        timeout=20,
    )
    assert_true(page.call_helper("setByLabel", "Description", "UI regression publish"), "Proposal type description input not found")
    assert_true(page.call_helper("clickButton", "Publish"), "Publish button not found")
    page.wait_until("proposal type publish success", "window.__astroproposeHelpers.hasText('Published proposal type')")
    page.wait_until("proposal type listed", f"window.__astroproposeHelpers.hasText({json.dumps(proposal_type_name)})")

    # Clear auth and switch to proposer.
    page.evaluate(
        """
        (() => {
          localStorage.removeItem('token');
          window.dispatchEvent(new Event('auth-change'));
          return true;
        })()
        """
    )

    login(page, frontend_url, "proposer", "password")

    open_path(page, frontend_url, "/proposals/new")
    page.wait_until("proposal creation page", "window.__astroproposeHelpers.hasText('Submit Phase-1 Proposal')")
    page.wait_until(
        "proposal type options loaded",
        f"window.__astroproposeHelpers.hasText({json.dumps(proposal_type_name)})",
        timeout=25,
    )
    page.wait_for_helper_truthy(
        "Proposal type select contains the published type",
        "selectByLabel",
        "Proposal Type",
        proposal_type_name,
        timeout=20,
    )
    page.wait_until(
        "workflow bound field label appears",
        f"window.__astroproposeHelpers.hasText({json.dumps(field_label)})",
        timeout=20,
    )
    assert_true(page.call_helper("setByLabel", "Proposal Title", proposal_title), "Proposal title input not found")
    assert_true(page.call_helper("setByLabel", "Abstract", "UI regression proposal abstract"), "Proposal abstract input not found")
    assert_true(page.call_helper("setByLabel", field_label, "UI regression field content"), "Workflow-bound field input not found")
    assert_true(page.call_helper("clickInstrument", "CSST Imaging Camera"), "Instrument toggle button not found")
    assert_true(page.call_helper("clickButton", "Submit Phase-1"), "Submit Phase-1 button not found")
    page.wait_until(
        "dashboard redirect after proposal submit",
        "window.__astroproposeHelpers.path() === '/dashboard'",
        timeout=30,
    )
    page.wait_until(
        "proposal visible on dashboard",
        f"window.__astroproposeHelpers.hasText({json.dumps(proposal_title)})",
        timeout=20,
    )
    row_text = page.call_helper("proposalRowText", proposal_title)
    assert_true("Submitted" in row_text, f"Expected proposal row to contain Submitted, got: {row_text}")

    page.capture_dom(artifact_dir / "success-dashboard.html")
    page.close()
    chrome.stop()

    return {
      "form_name": form_name,
      "field_label": field_label,
      "workflow_name": workflow_name,
      "proposal_type_name": proposal_type_name,
      "proposal_title": proposal_title,
      "dashboard_row_text": row_text,
    }


def main():
    parser = argparse.ArgumentParser(description="Run AstroPropose browser UI regression flow.")
    parser.add_argument(
        "--frontend-url",
        default=os.environ.get("ASTROPROPOSE_FRONTEND_URL", "http://127.0.0.1:3300"),
        help="Frontend base URL",
    )
    parser.add_argument(
        "--artifacts-dir",
        default=os.environ.get("ASTROPROPOSE_UI_ARTIFACTS", "/tmp/astropropose-ui-artifacts"),
        help="Directory for DOM artifacts on success/failure",
    )
    args = parser.parse_args()

    artifact_dir = Path(args.artifacts_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    try:
        summary = run_regression(args.frontend_url.rstrip("/"), artifact_dir)
        print(json.dumps({"status": "ok", "summary": summary}, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
