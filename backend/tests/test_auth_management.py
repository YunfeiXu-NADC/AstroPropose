from app import db
from app.models.models import Role, User
import pytest


def _create_user(username, email, password, is_active=True, role_name="Proposer"):
    user = User(username=username, email=email, is_active=is_active)
    user.set_password(password)
    role = Role.query.filter_by(name=role_name).first()
    assert role is not None, f"Role fixture '{role_name}' was not found"
    user.roles.append(role)
    db.session.add(user)
    db.session.commit()
    return user


def _login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_disabled_user_cannot_login(client, app):
    _create_user("disabled-user", "disabled@example.com", "password123", is_active=False)

    response = _login(client, "disabled-user", "password123")

    assert response.status_code == 403
    assert response.get_json()["message"] == "Account is disabled"


def test_disabled_user_token_is_rejected_on_me(client, app):
    _create_user("disabled-token-user", "disabled-token@example.com", "password123")
    login_response = _login(client, "disabled-token-user", "password123")
    token = login_response.get_json()["token"]

    user = User.query.filter_by(username="disabled-token-user").first()
    user.is_active = False
    db.session.commit()

    response = client.get("/api/auth/me", headers={"x-access-token": token})

    assert response.status_code == 401
    assert response.get_json()["message"] == "Token is invalid!"


def test_change_password_requires_correct_old_password(client, app):
    _create_user("password-change-user", "password-change@example.com", "password123")
    login_response = _login(client, "password-change-user", "password123")
    token = login_response.get_json()["token"]

    response = client.post(
        "/api/auth/change-password",
        headers={"x-access-token": token},
        json={"old_password": "wrong-password", "new_password": "new-password123"},
    )

    assert response.status_code == 400
    assert response.get_json()["message"] == "Current password is incorrect"


def test_successful_password_change_invalidates_old_login_and_allows_new_login(client, app):
    _create_user("password-reset-user", "password-reset@example.com", "password123")
    login_response = _login(client, "password-reset-user", "password123")
    token = login_response.get_json()["token"]

    change_response = client.post(
        "/api/auth/change-password",
        headers={"x-access-token": token},
        json={"old_password": "password123", "new_password": "new-password123"},
    )

    assert change_response.status_code == 200
    assert change_response.get_json()["message"] == "Password updated successfully"

    old_login_response = _login(client, "password-reset-user", "password123")
    assert old_login_response.status_code == 401
    assert old_login_response.get_json()["message"] == "Could not verify"

    new_login_response = _login(client, "password-reset-user", "new-password123")
    assert new_login_response.status_code == 200
    assert "token" in new_login_response.get_json()


def test_password_change_revokes_existing_token_for_protected_endpoints(client, app):
    _create_user("token-revoke-user", "token-revoke@example.com", "password123")
    login_response = _login(client, "token-revoke-user", "password123")
    token = login_response.get_json()["token"]

    change_response = client.post(
        "/api/auth/change-password",
        headers={"x-access-token": token},
        json={"old_password": "password123", "new_password": "new-password123"},
    )
    assert change_response.status_code == 200

    me_response = client.get("/api/auth/me", headers={"x-access-token": token})
    assert me_response.status_code == 401
    assert me_response.get_json()["message"] == "Token is invalid!"


def test_missing_role_fixture_fails_clearly(app):
    with pytest.raises(AssertionError, match="Role fixture 'MissingRole' was not found"):
        _create_user("missing-role-user", "missing-role@example.com", "password123", role_name="MissingRole")
