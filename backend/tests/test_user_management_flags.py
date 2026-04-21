from app import db
from app.models.models import Role, User


def test_seeded_roles_have_system_flags(app):
    seeded_role_names = [
        "Admin",
        "Proposer",
        "Panel Chair",
        "Instrument Scheduler",
    ]

    for role_name in seeded_role_names:
        role = Role.query.filter_by(name=role_name).first()
        assert role is not None
        assert role.is_system is True


def test_new_test_user_defaults_to_active(app):
    user = User(username="new-user", email="new-user@example.com")
    db.session.add(user)
    db.session.flush()

    assert user.is_active is True
