import importlib

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, text

from app import db
from app.models.models import Role, User


task1_migration = importlib.import_module(
    "migrations.versions.9f3b8a1c4d21_add_role_system_and_user_active"
)


def _create_legacy_auth_schema(database_url):
    engine = create_engine(database_url)
    metadata = MetaData()

    Table(
        "role",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(64), nullable=False, unique=True),
    )
    Table(
        "user",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("username", String(64), nullable=False, unique=True),
        Column("email", String(120), nullable=False, unique=True),
        Column("password_hash", String(256)),
    )

    metadata.create_all(engine)
    return engine


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
    db.session.commit()

    persisted_user = User.query.filter_by(username="new-user").first()

    assert persisted_user is not None
    assert persisted_user.is_active is True


def test_register_recreates_builtin_proposer_as_system_role(app, client):
    proposer_role = Role.query.filter_by(name="Proposer").first()
    db.session.delete(proposer_role)
    db.session.commit()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "fresh-user",
            "email": "fresh-user@example.com",
            "password": "password123",
        },
    )

    assert response.status_code == 201, response.get_json()

    recreated_role = Role.query.filter_by(name="Proposer").first()
    registered_user = User.query.filter_by(username="fresh-user").first()

    assert recreated_role is not None
    assert recreated_role.is_system is True
    assert registered_user is not None
    assert {role.name for role in registered_user.roles} == {"Proposer"}


def test_task1_migration_backfills_sqlite_legacy_auth_data(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'legacy-auth.db'}"
    engine = _create_legacy_auth_schema(database_url)

    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO role (id, name) VALUES (1, 'Admin'), (2, 'Proposer'), (3, 'Reviewer')")
        )
        connection.execute(
            text(
                "INSERT INTO user (id, username, email, password_hash) "
                "VALUES (1, 'legacy-user', 'legacy-user@example.com', NULL)"
            )
        )

        migration_context = MigrationContext.configure(connection)
        with Operations.context(migration_context):
            task1_migration.upgrade()

    with engine.connect() as connection:
        role_flags = dict(connection.execute(text("SELECT name, is_system FROM role")).all())
        legacy_user_active = connection.execute(
            text("SELECT is_active FROM user WHERE username = 'legacy-user'")
        ).scalar_one()

    engine.dispose()

    assert role_flags["Admin"] == 1
    assert role_flags["Proposer"] == 1
    assert role_flags["Reviewer"] == 0
    assert legacy_user_active == 1
