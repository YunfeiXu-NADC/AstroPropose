from app import db
from app.models.models import Role, User, Workflow, WorkflowState, WorkflowTransition


def _auth_headers(token):
    return {"x-access-token": token}


def test_admin_can_create_custom_role(client, admin_token):
    response = client.post(
        "/api/admin/roles",
        headers=_auth_headers(admin_token),
        json={"name": "Data Curator"},
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["name"] == "Data Curator"
    assert body["is_system"] is False
    assert body["user_count"] == 0
    assert body["workflow_reference_count"] == 0

    role = Role.query.filter_by(name="Data Curator").first()
    assert role is not None


def test_system_role_cannot_be_renamed(client, admin_token, app):
    role = Role.query.filter_by(name="Proposer").first()
    assert role is not None

    response = client.patch(
        f"/api/admin/roles/{role.id}",
        headers=_auth_headers(admin_token),
        json={"name": "New Proposer"},
    )

    assert response.status_code == 400
    assert response.get_json()["message"] == "System roles cannot be renamed"


def test_bound_role_cannot_be_deleted(client, admin_token, app):
    role = Role(name="Bound Role", is_system=False)
    user = User(username="role-bound-user", email="role-bound@example.com", is_active=True)
    user.set_password("password123")
    user.roles.append(role)
    db.session.add(user)

    workflow = Workflow(name="Bound Role Workflow", definition={})
    from_state = WorkflowState(name="Draft", workflow=workflow)
    to_state = WorkflowState(name="Submitted", workflow=workflow)
    db.session.add_all([workflow, from_state, to_state])
    db.session.commit()

    transition = WorkflowTransition(
        workflow_id=workflow.id,
        name="submit",
        from_state_id=from_state.id,
        to_state_id=to_state.id,
        allowed_roles=["Bound Role"],
    )
    db.session.add(transition)
    db.session.commit()

    response = client.delete(
        f"/api/admin/roles/{role.id}",
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 400
    assert response.get_json()["message"] == "Role is assigned to users or referenced by workflow transitions"
