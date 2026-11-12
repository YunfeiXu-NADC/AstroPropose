from flask import Blueprint, jsonify, request

from app import db
from app.api.auth import admin_required, token_required
from app.core.seasons import parse_beijing_datetime, serialize_season
from app.models.models import ProposalSeason


bp = Blueprint('seasons', __name__)


def _validated_fields(data):
    name = str(data.get('name') or '').strip()
    if not name:
        raise ValueError('请填写批次名称')
    start = parse_beijing_datetime(data.get('start_date'))
    end = parse_beijing_datetime(data.get('end_date'))
    release = parse_beijing_datetime(data.get('data_release_deadline'))
    if not start < end <= release:
        raise ValueError('时间应依次为：开始申请、接受提案截止、数据释放最晚时间')
    return name, start, end, release


def _overlaps(start, end, excluded_id=None):
    query = ProposalSeason.query.filter(
        ProposalSeason.is_legacy.is_(False),
        ProposalSeason.start_date <= end,
        ProposalSeason.end_date >= start,
    )
    if excluded_id is not None:
        query = query.filter(ProposalSeason.id != excluded_id)
    return query.first() is not None


@bp.route('/', methods=['GET'])
@token_required
def list_seasons(current_user):
    seasons = ProposalSeason.query.order_by(ProposalSeason.start_date.desc(), ProposalSeason.id.desc()).all()
    return jsonify([serialize_season(season) for season in seasons])


@bp.route('/', methods=['POST'])
@token_required
@admin_required
def create_season(current_user):
    try:
        name, start, end, release = _validated_fields(request.get_json() or {})
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    if ProposalSeason.query.filter_by(name=name).first():
        return jsonify({'message': '批次名称已存在'}), 409
    if _overlaps(start, end):
        return jsonify({'message': '申请时间与已有批次重叠'}), 409
    season = ProposalSeason(name=name, start_date=start, end_date=end, data_release_deadline=release)
    db.session.add(season)
    db.session.commit()
    return jsonify(serialize_season(season)), 201


@bp.route('/<int:season_id>', methods=['PATCH'])
@token_required
@admin_required
def update_season(current_user, season_id):
    season = ProposalSeason.query.get_or_404(season_id)
    if season.is_legacy:
        return jsonify({'message': '历史提案批次不可修改时间'}), 409
    data = request.get_json() or {}
    merged = {
        'name': data.get('name', season.name),
        'start_date': data.get('start_date', serialize_season(season)['start_date']),
        'end_date': data.get('end_date', serialize_season(season)['end_date']),
        'data_release_deadline': data.get('data_release_deadline', serialize_season(season)['data_release_deadline']),
    }
    try:
        name, start, end, release = _validated_fields(merged)
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    same_name = ProposalSeason.query.filter_by(name=name).first()
    if same_name and same_name.id != season.id:
        return jsonify({'message': '批次名称已存在'}), 409
    if _overlaps(start, end, season.id):
        return jsonify({'message': '申请时间与已有批次重叠'}), 409
    season.name = name
    season.start_date = start
    season.end_date = end
    season.data_release_deadline = release
    db.session.commit()
    return jsonify(serialize_season(season))
