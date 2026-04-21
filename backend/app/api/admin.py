from flask import Blueprint, jsonify, request

from app import db
from app.api.auth import admin_required, token_required
from app.models.models import Role, User, WorkflowTransition


bp = Blueprint("admin", __name__)


def _serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "roles": [role.name for role in user.roles],
    }


def _serialize_role(role):
    return {
        "id": role.id,
        "name": role.name,
        "is_system": role.is_system,
        "user_count": len(role.users),
        "workflow_reference_count": _workflow_reference_count(role.name),
    }


def _workflow_reference_count(role_name):
    count = 0
    for transition in WorkflowTransition.query.all():
        allowed_roles = transition.allowed_roles or []
        if role_name in allowed_roles:
            count += 1
    return count


def _get_role_ids(data):
    role_ids = data.get("role_ids")
    if role_ids:
        return role_ids

    proposer = Role.query.filter_by(name="Proposer").first()
    if proposer is None:
        return []
    return [proposer.id]


def _load_roles(role_ids):
    roles = Role.query.filter(Role.id.in_(role_ids)).all() if role_ids else []
    if len(roles) != len(set(role_ids)):
        return None
    return roles


@bp.route("/users", methods=["GET"])
@token_required
@admin_required
def list_users(current_user):
    users = User.query.order_by(User.id).all()
    return jsonify([_serialize_user(user) for user in users])


@bp.route("/users", methods=["POST"])
@token_required
@admin_required
def create_user(current_user):
    data = request.get_json() or {}
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({"message": "username, email, and password are required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"message": "Username already exists"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already exists"}), 409

    role_ids = _get_role_ids(data)
    roles = _load_roles(role_ids)
    if roles is None:
        return jsonify({"message": "One or more roles were not found"}), 404

    user = User(
        username=username,
        email=email,
        is_active=data.get("is_active", True),
    )
    user.set_password(password)
    user.roles = roles
    db.session.add(user)
    db.session.commit()
    return jsonify(_serialize_user(user)), 201


@bp.route("/users/<int:id>", methods=["PATCH"])
@token_required
@admin_required
def update_user(current_user, id):
    user = User.query.get_or_404(id)
    data = request.get_json() or {}

    if "email" in data and data["email"] != user.email:
        existing = User.query.filter_by(email=data["email"]).first()
        if existing and existing.id != user.id:
            return jsonify({"message": "Email already exists"}), 409
        user.email = data["email"]

    if "role_ids" in data:
        roles = _load_roles(data.get("role_ids") or [])
        if roles is None:
            return jsonify({"message": "One or more roles were not found"}), 404
        user.roles = roles

    if "is_active" in data:
        if user.id == current_user.id and data["is_active"] is False:
            return jsonify({"message": "Cannot disable your own account"}), 400
        user.is_active = data["is_active"]

    db.session.commit()
    return jsonify(_serialize_user(user))


@bp.route("/users/<int:id>/reset-password", methods=["POST"])
@token_required
@admin_required
def reset_user_password(current_user, id):
    user = User.query.get_or_404(id)
    data = request.get_json() or {}
    new_password = data.get("new_password")

    if not new_password:
        return jsonify({"message": "new_password is required"}), 400

    user.set_password(new_password)
    db.session.commit()
    return jsonify({"message": "Password reset successfully"})


@bp.route("/roles", methods=["GET"])
@token_required
@admin_required
def list_roles(current_user):
    roles = Role.query.order_by(Role.id).all()
    return jsonify([_serialize_role(role) for role in roles])


@bp.route("/roles", methods=["POST"])
@token_required
@admin_required
def create_role(current_user):
    data = request.get_json() or {}
    name = data.get("name")
    if not name:
        return jsonify({"message": "name is required"}), 400

    if Role.query.filter_by(name=name).first():
        return jsonify({"message": "Role already exists"}), 409

    role = Role(name=name, is_system=False)
    db.session.add(role)
    db.session.commit()
    return jsonify(_serialize_role(role)), 201


@bp.route("/roles/<int:id>", methods=["PATCH"])
@token_required
@admin_required
def update_role(current_user, id):
    role = Role.query.get_or_404(id)
    data = request.get_json() or {}

    if role.is_system and "name" in data and data["name"] != role.name:
        return jsonify({"message": "System roles cannot be renamed"}), 400

    if "name" in data and data["name"] != role.name:
        if _workflow_reference_count(role.name) > 0:
            return jsonify({"message": "Role is assigned to users or referenced by workflow transitions"}), 400
        existing = Role.query.filter_by(name=data["name"]).first()
        if existing and existing.id != role.id:
            return jsonify({"message": "Role already exists"}), 409
        role.name = data["name"]

    db.session.commit()
    return jsonify(_serialize_role(role))


@bp.route("/roles/<int:id>", methods=["DELETE"])
@token_required
@admin_required
def delete_role(current_user, id):
    role = Role.query.get_or_404(id)

    if role.is_system:
        return jsonify({"message": "System roles cannot be deleted"}), 400

    if role.users:
        return jsonify({"message": "Role is assigned to users or referenced by workflow transitions"}), 400

    if _workflow_reference_count(role.name) > 0:
        return jsonify({"message": "Role is assigned to users or referenced by workflow transitions"}), 400

    db.session.delete(role)
    db.session.commit()
    return jsonify({"message": "Role deleted successfully"})
