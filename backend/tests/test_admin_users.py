import pytest

from app import db
from app.models.models import ProposalType, Role, User


def _auth_headers(token):
    return {"x-access-token": token}


def test_non_admin_cannot_list_users(client, proposer_token):
    response = client.get("/api/admin/users", headers=_auth_headers(proposer_token))

    assert response.status_code == 403
    assert response.get_json()["message"] == "Admin role required!"


def test_admin_can_create_user(client, admin_token, app):
    role = Role.query.filter_by(name="Proposer").first()
    assert role is not None

    response = client.post(
        "/api/admin/users",
        headers=_auth_headers(admin_token),
        json={
            "username": "new-admin-user",
            "email": "new-admin@example.com",
            "password": "password123",
            "role_ids": [role.id],
        },
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["username"] == "new-admin-user"
    assert body["email"] == "new-admin@example.com"
    assert body["is_active"] is True
    assert body["roles"] == ["Proposer"]

    created_user = User.query.filter_by(username="new-admin-user").first()
    assert created_user is not None
    assert created_user.check_password("password123")
    assert created_user.is_active is True


def test_reviewer_permission_is_additive_to_proposal_access(client, admin_token, app):
    reviewer_role = Role.query.filter_by(name="Reviewer").first()
    proposal_type = ProposalType.query.first()
    response = client.post(
        "/api/admin/users",
        headers=_auth_headers(admin_token),
        json={
            "username": "reviewer-proposer",
            "email": "reviewer-proposer@example.com",
            "password": "password123",
            "role_ids": [reviewer_role.id],
        },
    )
    assert response.status_code == 201
    assert response.get_json()["roles"] == ["Proposer", "Reviewer"]

    login = client.post(
        "/api/auth/login",
        json={"username": "reviewer-proposer", "password": "password123"},
    )
    headers = _auth_headers(login.get_json()["token"])
    assert client.get("/api/auth/me", headers=headers).get_json()["roles"] == ["Proposer", "Reviewer"]

    draft = client.post(
        "/api/proposals/",
        headers=headers,
        json={"title": "Reviewer proposal", "proposal_type_id": proposal_type.id, "save_as_draft": True},
    )
    assert draft.status_code == 201
    assert [item["title"] for item in client.get("/api/proposals/", headers=headers).get_json()] == ["Reviewer proposal"]

    removed = client.patch(
        f'/api/admin/users/{response.get_json()["id"]}',
        headers=_auth_headers(admin_token),
        json={"role_ids": []},
    )
    assert removed.status_code == 200
    assert removed.get_json()["roles"] == ["Proposer"]


@pytest.mark.parametrize("extra_role", [
    None, "Technical Expert", "Reviewer", "Panel Chair",
    "Proposal Manager", "Instrument Scheduler", "Admin",
])
def test_each_account_type_can_submit_own_proposal(client, app, extra_role):
    username = (extra_role or "plain").lower().replace(" ", "-") + "-applicant"
    user = User(username=username, email=f"{username}@example.com", is_active=True)
    user.set_password("password123")
    if extra_role:
        user.roles.append(Role.query.filter_by(name=extra_role).one())
    db.session.add(user)
    db.session.commit()

    token = client.post(
        "/api/auth/login", json={"username": username, "password": "password123"},
    ).get_json()["token"]
    headers = _auth_headers(token)
    me = client.get("/api/auth/me", headers=headers).get_json()
    assert "Proposer" in me["roles"]
    if extra_role:
        assert extra_role in me["roles"]

    proposal_type = ProposalType.query.first()
    created = client.post(
        "/api/proposals/", headers=headers,
        json={
            "title": f"{username} research",
            "abstract": "A complete test proposal abstract.",
            "proposal_type_id": proposal_type.id,
            "save_as_draft": True,
            "instruments": [{"instrument_code": "LF"}],
        },
    )
    assert created.status_code == 201
    proposal_id = created.get_json()["id"]
    assert [item["id"] for item in client.get("/api/proposals/", headers=headers).get_json()] == [proposal_id]
    actions = client.get(f"/api/proposals/{proposal_id}/transitions", headers=headers).get_json()["transitions"]
    assert "submit_phase1" in {action["name"] for action in actions}
    submitted = client.post(
        f"/api/proposals/{proposal_id}/transitions", headers=headers,
        json={"transition": "submit_phase1"},
    )
    assert submitted.status_code == 200
    assert submitted.get_json()["new_state"] == "Submitted"


def test_admin_can_update_user_email_roles_and_active_status(client, admin_token, app):
    custom_role = Role(name="Editorial Reviewer", is_system=False)
    db.session.add(custom_role)
    user = User(username="target-user", email="target@example.com", is_active=True)
    user.set_password("password123")
    db.session.add(user)
    db.session.commit()

    response = client.patch(
        f"/api/admin/users/{user.id}",
        headers=_auth_headers(admin_token),
        json={
            "email": "updated@example.com",
            "role_ids": [custom_role.id],
            "is_active": False,
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["email"] == "updated@example.com"
    assert body["is_active"] is False
    assert body["roles"] == ["Editorial Reviewer"]

    updated_user = User.query.get(user.id)
    assert updated_user.email == "updated@example.com"
    assert updated_user.is_active is False
    assert [role.name for role in updated_user.roles] == ["Editorial Reviewer"]


def test_admin_can_reset_password(client, admin_token, app):
    user = User(username="reset-user", email="reset@example.com", is_active=True)
    user.set_password("old-password")
    db.session.add(user)
    db.session.commit()

    response = client.post(
        f"/api/admin/users/{user.id}/reset-password",
        headers=_auth_headers(admin_token),
        json={"new_password": "new-password"},
    )

    assert response.status_code == 200
    assert response.get_json()["message"] == "Password reset successfully"
    refreshed_user = User.query.get(user.id)
    assert refreshed_user.check_password("new-password")
