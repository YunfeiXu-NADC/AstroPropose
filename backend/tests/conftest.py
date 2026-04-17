import pytest
import os
import tempfile

from app import create_app, db
from app.models.models import (
    FormTemplate,
    Instrument,
    ProposalType,
    Role,
    User,
    Workflow,
    WorkflowState,
)


class TestConfig:
    TESTING = True
    # 使用文件系统的SQLite数据库，便于调试
    # 数据库文件会在测试目录下创建
    basedir = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(basedir, 'test.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = "test-secret"
    WTF_CSRF_ENABLED = False


@pytest.fixture
def app():
    fd, db_path = tempfile.mkstemp(suffix=".db", dir=TestConfig.basedir)
    os.close(fd)

    class RuntimeTestConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"

    app = create_app(RuntimeTestConfig)
    with app.app_context():
        db.create_all()
        seed_reference_data()
        yield app
        db.session.remove()
        db.drop_all()
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture
def client(app):
    return app.test_client()


def seed_reference_data():
    """Create baseline roles, workflow, proposal types, instruments, and templates."""
    proposer_role = Role(name="Proposer")
    admin_role = Role(name="Admin")
    scheduler_role = Role(name="Instrument Scheduler")
    chair_role = Role(name="Panel Chair")
    db.session.add_all([proposer_role, admin_role, scheduler_role, chair_role])

    workflow_definition = {
        "initial_state": "Draft",
        "transitions": [
            {
                "name": "submit_phase1",
                "label": "提交 Phase-1",
                "from": "Draft",
                "to": "Submitted",
                "roles": ["Proposer"],
                "effects": {
                    "phase": "phase1",
                    "set_phase_status": "submitted",
                    "record_submission_time": True,
                },
            }
        ],
    }

    workflow = Workflow(name="CSST Phase Workflow", definition=workflow_definition)
    draft_state = WorkflowState(name="Draft", workflow=workflow)
    submitted_state = WorkflowState(name="Submitted", workflow=workflow)

    proposal_type = ProposalType(name="CSST Phase-1", workflow=workflow)
    instrument = Instrument(code="MCI", name="Multi-channel Imager", description="CSST 多波段相机")
    template = FormTemplate(
        name="CSST Phase-1 Common",
        definition={
            "fields": [
                {"name": "science_objective", "label": "科学目标", "type": "textarea", "required": True},
                {"name": "abstract", "label": "摘要", "type": "textarea", "required": False},
            ]
        },
        phase="phase1",
    )
    template.instrument = instrument

    db.session.add_all(
        [
            workflow,
            draft_state,
            submitted_state,
            proposal_type,
            instrument,
            template,
        ]
    )
    db.session.commit()


@pytest.fixture
def proposer_token(app):
    """Create a proposer account and return its authentication token."""
    user = User(username="proposer", email="proposer@example.com")
    user.set_password("password123")
    role = Role.query.filter_by(name="Proposer").first()
    user.roles.append(role)
    db.session.add(user)
    db.session.commit()

    client = app.test_client()
    response = client.post(
        "/api/auth/login", json={"username": "proposer", "password": "password123"}
    )
    token = response.get_json()["token"]
    return token


@pytest.fixture
def admin_token(app):
    """Create an admin account and return its authentication token."""
    user = User(username="admin-user", email="admin@example.com")
    user.set_password("password123")
    role = Role.query.filter_by(name="Admin").first()
    user.roles.append(role)
    db.session.add(user)
    db.session.commit()

    client = app.test_client()
    response = client.post(
        "/api/auth/login", json={"username": "admin-user", "password": "password123"}
    )
    token = response.get_json()["token"]
    return token
