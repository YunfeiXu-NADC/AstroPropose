from app import db
from app.models.models import Role, User


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
