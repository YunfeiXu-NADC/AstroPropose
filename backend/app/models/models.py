from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from app import db


# --------------------------------------------------------------------------- #
# 用户与权限
# --------------------------------------------------------------------------- #

roles_users = db.Table(
    "roles_users",
    db.Column("user_id", db.Integer, db.ForeignKey("user.id"), primary_key=True),
    db.Column("role_id", db.Integer, db.ForeignKey("role.id"), primary_key=True),
)


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True, nullable=False)
    email = db.Column(db.String(120), index=True, unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    roles = db.relationship("Role", secondary=roles_users, lazy="select", backref=db.backref("users", lazy=True))
    proposals = db.relationship("Proposal", backref="author", lazy="dynamic")
    instrument_feedbacks = db.relationship("InstrumentFeedback", backref="scheduler", lazy="dynamic")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def has_role(self, role_name):
        return any(role.name == role_name for role in self.roles)


class Role(db.Model):
    __tablename__ = 'role'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    is_system = db.Column(db.Boolean, nullable=False, default=False)


# --------------------------------------------------------------------------- #
# 工作流与提案
# --------------------------------------------------------------------------- #

class ProposalSeason(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), nullable=False)
    start_date = db.Column(db.DateTime)
    end_date = db.Column(db.DateTime)
    phase_one_deadline = db.Column(db.DateTime)
    phase_two_deadline = db.Column(db.DateTime)
    proposal_types = db.relationship("ProposalType", backref="season", lazy="dynamic")


class Workflow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), unique=True, nullable=False)
    description = db.Column(db.Text)
    definition = db.Column(db.JSON)
    proposal_types = db.relationship("ProposalType", backref="workflow", lazy="dynamic")
    states = db.relationship("WorkflowState", backref="workflow", lazy="dynamic", cascade="all, delete-orphan")
    actions = db.relationship("WorkflowAction", backref="workflow", lazy="dynamic", cascade="all, delete-orphan")


class WorkflowState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), nullable=False)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflow.id"))
    # 新增：关联表单模板
    form_template_id = db.Column(db.Integer, db.ForeignKey("form_template.id"), nullable=True)
    form_required = db.Column(db.Boolean, default=False)  # 是否必须填写表单才能离开此状态
    description = db.Column(db.Text)  # 状态说明
    
    proposals = db.relationship("Proposal", backref="current_state", lazy="dynamic")
    form_template = db.relationship("FormTemplate", backref="workflow_states")
    transitions_from = db.relationship(
        "WorkflowTransition",
        backref="from_state",
        lazy="dynamic",
        foreign_keys="WorkflowTransition.from_state_id",
        cascade="all, delete-orphan",
    )
    transitions_to = db.relationship(
        "WorkflowTransition",
        backref="to_state",
        lazy="dynamic",
        foreign_keys="WorkflowTransition.to_state_id",
        cascade="all, delete-orphan",
    )


class WorkflowAction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflow.id"), nullable=False)
    name = db.Column(db.String(140), nullable=False)
    action_type = db.Column(db.String(64), nullable=False)
    config = db.Column(db.JSON, default=dict)
    transitions = db.relationship("WorkflowTransition", backref="action", lazy="dynamic")


class WorkflowTransition(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflow.id"), nullable=False)
    name = db.Column(db.String(140), nullable=False)
    from_state_id = db.Column(db.Integer, db.ForeignKey("workflow_state.id"), nullable=False)
    to_state_id = db.Column(db.Integer, db.ForeignKey("workflow_state.id"), nullable=False)
    allowed_roles = db.Column(db.JSON, default=list)
    condition = db.Column(db.JSON, default=dict)
    action_id = db.Column(db.Integer, db.ForeignKey("workflow_action.id"))


class ProposalType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    description = db.Column(db.Text)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflow.id"), nullable=False)
    season_id = db.Column(db.Integer, db.ForeignKey("proposal_season.id"))
    proposals = db.relationship("Proposal", backref="proposal_type", lazy="dynamic")


class Proposal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(140), nullable=False)
    abstract = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, index=True, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    proposal_type_id = db.Column(db.Integer, db.ForeignKey("proposal_type.id"), nullable=False)
    current_state_id = db.Column(db.Integer, db.ForeignKey("workflow_state.id"))
    data = db.Column(db.JSON, default=dict)

    phases = db.relationship("ProposalPhase", backref="proposal", lazy="dynamic", cascade="all, delete-orphan")
    instruments = db.relationship(
        "ProposalInstrument", backref="proposal", lazy="dynamic", cascade="all, delete-orphan"
    )
    state_history = db.relationship(
        "ProposalStateHistory", backref="proposal", lazy="dynamic", cascade="all, delete-orphan"
    )


class ProposalStateHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    proposal_id = db.Column(db.Integer, db.ForeignKey("proposal.id"), nullable=False)
    from_state = db.Column(db.String(64))
    to_state = db.Column(db.String(64))
    transition_name = db.Column(db.String(140))
    acted_by = db.Column(db.String(64))
    acted_at = db.Column(db.DateTime, default=datetime.utcnow)
    meta = db.Column(db.JSON, default=dict)


class ProposalPhase(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    proposal_id = db.Column(db.Integer, db.ForeignKey("proposal.id"), nullable=False)
    phase = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(64), default="pending")
    opened_at = db.Column(db.DateTime)
    submitted_at = db.Column(db.DateTime)
    confirmed_at = db.Column(db.DateTime)
    locked_at = db.Column(db.DateTime)
    deadline = db.Column(db.DateTime)
    payload = db.Column(db.JSON, default=dict)
    notes = db.Column(db.Text)
    __table_args__ = (
        db.Index("ix_proposal_phase_unique", "proposal_id", "phase", unique=True),
    )


# --------------------------------------------------------------------------- #
# 表单与仪器
# --------------------------------------------------------------------------- #

class FormTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), unique=True, nullable=False)
    definition = db.Column(db.JSON)
    phase = db.Column(db.String(32))
    version = db.Column(db.Integer, default=1)
    instrument_id = db.Column(db.Integer, db.ForeignKey("instrument.id"))
    instrument = db.relationship("Instrument", backref=db.backref("form_templates", lazy="dynamic"))


class Instrument(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    proposal_instruments = db.relationship(
        "ProposalInstrument", backref="instrument", lazy="dynamic", cascade="all, delete-orphan"
    )


class ProposalInstrument(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    proposal_id = db.Column(db.Integer, db.ForeignKey("proposal.id"), nullable=False)
    instrument_id = db.Column(db.Integer, db.ForeignKey("instrument.id"), nullable=False)
    phase = db.Column(db.String(32), nullable=False, default="phase1")
    status = db.Column(db.String(64), default="pending")
    form_data = db.Column(db.JSON, default=dict)
    scheduling_feedback = db.Column(db.JSON, default=dict)
    confirmed_at = db.Column(db.DateTime)
    feedback_submitted_at = db.Column(db.DateTime)
    applicant_confirmed_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    feedbacks = db.relationship(
        "InstrumentFeedback", backref="proposal_instrument", lazy="dynamic", cascade="all, delete-orphan"
    )
    __table_args__ = (
        db.UniqueConstraint("proposal_id", "instrument_id", "phase", name="uq_proposal_instrument"),
        db.Index("ix_proposal_instrument_queue", "instrument_id", "phase", "status"),
    )


class InstrumentFeedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    proposal_instrument_id = db.Column(db.Integer, db.ForeignKey("proposal_instrument.id"), nullable=False)
    scheduler_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    payload = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(64), default="draft")
    comment = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# --------------------------------------------------------------------------- #
# 外部工具集成
# --------------------------------------------------------------------------- #

class ExternalTool(db.Model):
    """
    外部工具/API 注册表
    支持 OpenAPI 规范导入或手动配置
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), unique=True, nullable=False)
    description = db.Column(db.Text)
    
    # API 配置
    base_url = db.Column(db.String(512), nullable=False)  # e.g., https://api.example.com
    openapi_spec_url = db.Column(db.String(512))  # OpenAPI 规范 URL（可选）
    openapi_spec = db.Column(db.JSON)  # 解析后的 OpenAPI 规范（缓存）
    
    # 认证配置
    auth_type = db.Column(db.String(32), default="none")  # none, api_key, bearer, basic, oauth2
    auth_config = db.Column(db.JSON, default=dict)  # 认证详细配置（加密存储）
    
    # 元数据
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联的操作
    operations = db.relationship("ExternalToolOperation", backref="tool", lazy="dynamic", cascade="all, delete-orphan")


class ExternalToolOperation(db.Model):
    """
    外部工具的具体操作/端点
    可从 OpenAPI 自动导入或手动定义
    """
    id = db.Column(db.Integer, primary_key=True)
    tool_id = db.Column(db.Integer, db.ForeignKey("external_tool.id"), nullable=False)
    
    # 操作标识
    operation_id = db.Column(db.String(128), nullable=False)  # 唯一操作标识，如 "createNotification"
    name = db.Column(db.String(140), nullable=False)  # 显示名称
    description = db.Column(db.Text)
    
    # HTTP 配置
    method = db.Column(db.String(10), nullable=False)  # GET, POST, PUT, PATCH, DELETE
    path = db.Column(db.String(512), nullable=False)  # 相对路径，如 /api/v1/notifications
    
    # 参数定义 (JSON Schema 格式)
    parameters = db.Column(db.JSON, default=dict)  # path, query, header 参数
    request_body = db.Column(db.JSON, default=dict)  # 请求体 schema
    response_schema = db.Column(db.JSON, default=dict)  # 响应 schema
    
    # 工作流集成配置
    input_mapping = db.Column(db.JSON, default=dict)  # 从 proposal/context 映射到 API 参数
    output_mapping = db.Column(db.JSON, default=dict)  # 从 API 响应映射到 proposal/context
    
    # 执行配置
    timeout = db.Column(db.Integer, default=30)  # 超时秒数
    retry_config = db.Column(db.JSON, default=dict)  # 重试策略
    
    # 工具类型和验证配置
    tool_type = db.Column(db.String(32), default='other')  # validation, notification, data_processing, other
    validation_config = db.Column(db.JSON, default=dict)  # 验证配置（仅对 validation 类型有效）
    # validation_config 格式：
    # {
    #   "block_on_failure": true,  # 验证失败时是否阻止工作流转换
    #   "block_on_service_error": false,  # 服务不可用时是否阻止（vs 仅记录错误）
    #   "failure_conditions": [  # 定义验证失败的条件
    #     {"path": "response.visible", "operator": "==", "value": false},
    #     {"path": "response.status", "operator": "!=", "value": "ok"}
    #   ],
    #   "error_message_template": "Target is not visible: {response.reason}"  # 错误消息模板
    # }
    
    __table_args__ = (
        db.UniqueConstraint("tool_id", "operation_id", name="uq_tool_operation"),
    )


class ExternalToolExecution(db.Model):
    """
    外部工具执行日志
    记录每次 API 调用的详细信息
    """
    id = db.Column(db.Integer, primary_key=True)
    operation_id = db.Column(db.Integer, db.ForeignKey("external_tool_operation.id"), nullable=False)
    proposal_id = db.Column(db.Integer, db.ForeignKey("proposal.id"))
    
    # 执行上下文
    triggered_by = db.Column(db.String(140))  # 触发源：transition_name 或 manual
    actor_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    
    # 请求详情
    request_url = db.Column(db.String(1024))
    request_method = db.Column(db.String(10))
    request_headers = db.Column(db.JSON, default=dict)  # 脱敏后
    request_body = db.Column(db.JSON, default=dict)
    
    # 响应详情
    response_status = db.Column(db.Integer)
    response_headers = db.Column(db.JSON, default=dict)
    response_body = db.Column(db.JSON, default=dict)
    
    # 执行状态
    status = db.Column(db.String(32), default="pending")  # pending, running, success, failed, retrying
    error_message = db.Column(db.Text)
    retry_count = db.Column(db.Integer, default=0)
    
    # 时间戳
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    # 关联
    operation = db.relationship("ExternalToolOperation", backref="executions")
    proposal = db.relationship("Proposal", backref="tool_executions")
    actor = db.relationship("User", backref="tool_executions")
