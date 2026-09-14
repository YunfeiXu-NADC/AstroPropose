"""Idempotently install the two DSL RPS workflow presets into the configured database."""

import json
import subprocess
from pathlib import Path

from app import create_app, db
from app.models.models import FormTemplate, Instrument, ProposalType, Workflow, WorkflowState


ROOT = Path(__file__).resolve().parents[1]
PRESET_MODULE = ROOT / "frontend" / "lib" / "dslWorkflowPresets.mjs"


def load_presets():
    source = (
        f"import {{ DSL_FORM_PRESETS, DSL_WORKFLOW_PRESETS, bindDslForms }} from {json.dumps(PRESET_MODULE.as_uri())};"
        "process.stdout.write(JSON.stringify({forms: DSL_FORM_PRESETS, workflows: DSL_WORKFLOW_PRESETS}));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", source],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def sync_states(workflow, definition):
    desired = [node["data"]["label"] for node in definition.get("nodes", [])]
    existing = {state.name: state for state in workflow.states.all()}

    for node in definition.get("nodes", []):
        data = node.get("data") or {}
        name = data.get("label")
        if not name:
            continue
        state = existing.get(name)
        if state is None:
            state = WorkflowState(name=name, workflow=workflow)
            db.session.add(state)
        state.description = data.get("description")
        state.form_template_id = data.get("formTemplateId")
        state.form_required = bool(data.get("formRequired", False))

    for name, state in existing.items():
        if name not in desired and state.proposals.count() == 0:
            db.session.delete(state)


def install():
    app = create_app()
    with app.app_context():
        for code, name, description in (
            ('LF', 'DSL 低频成像阵列', '0.1–30 MHz 超长波干涉成像'),
            ('HF', 'DSL 高频频谱仪', '0.1–120 MHz 低频射电频谱观测'),
        ):
            instrument = Instrument.query.filter_by(code=code).first()
            if instrument is None:
                instrument = Instrument(code=code)
                db.session.add(instrument)
            instrument.name = name
            instrument.description = description

        presets = load_presets()
        form_ids = {}
        for preset in presets["forms"]:
            instrument = None
            if preset.get("instrument_code"):
                instrument = Instrument.query.filter_by(code=preset["instrument_code"]).one()
            template = FormTemplate.query.filter_by(name=preset["name"]).first()
            if template is None:
                template = FormTemplate(name=preset["name"])
                db.session.add(template)
            template.phase = preset.get("phase", "phase1")
            template.instrument = instrument
            template.definition = preset["definition"]
            db.session.flush()
            form_ids[preset["key"]] = template.id

        for preset in presets["workflows"]:
            definition = dict(preset["definition"])
            definition["nodes"] = [
                {
                    **node,
                    "data": {
                        **(node.get("data") or {}),
                        "formTemplateId": form_ids.get((node.get("data") or {}).get("formKey")),
                    },
                }
                for node in definition.get("nodes", [])
            ]
            workflow = Workflow.query.filter_by(name=preset["workflowName"]).first()
            if workflow is None:
                workflow = Workflow(name=preset["workflowName"])
                db.session.add(workflow)
            workflow.description = preset["description"]
            workflow.definition = definition
            db.session.flush()
            sync_states(workflow, definition)

            proposal_type = ProposalType.query.filter_by(name=preset["proposalTypeName"]).first()
            if proposal_type is None:
                proposal_type = ProposalType(name=preset["proposalTypeName"], workflow=workflow)
                db.session.add(proposal_type)
            proposal_type.description = preset["description"]
            proposal_type.workflow = workflow

        db.session.commit()
        print("DSL RPS workflows installed: research, opportunity")


if __name__ == "__main__":
    install()
