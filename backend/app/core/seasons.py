"""Annual proposal batch dates are stored as naive UTC and shown in Beijing time."""

from datetime import datetime, timedelta, timezone

from app.models.models import ProposalSeason


BEIJING = timezone(timedelta(hours=8))
UTC = timezone.utc


def parse_beijing_datetime(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('请填写完整的批次时间')
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError as exc:
        raise ValueError('批次时间格式无效') from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=BEIJING)
    return parsed.astimezone(UTC).replace(tzinfo=None)


def format_beijing_datetime(value):
    if value is None:
        return None
    return value.replace(tzinfo=UTC).astimezone(BEIJING).isoformat(timespec='minutes')


def season_status(season, now=None):
    if season.is_legacy:
        return 'legacy'
    now = now or datetime.utcnow()
    if now < season.start_date:
        return 'upcoming'
    if now > season.end_date:
        return 'closed'
    return 'accepting'


def serialize_season(season, now=None):
    now = now or datetime.utcnow()
    return {
        'id': season.id,
        'name': season.name,
        'start_date': format_beijing_datetime(season.start_date),
        'end_date': format_beijing_datetime(season.end_date),
        'data_release_deadline': format_beijing_datetime(season.data_release_deadline),
        'is_legacy': bool(season.is_legacy),
        'status': season_status(season, now),
        'can_allocate_data': bool(season.is_legacy or (season.data_release_deadline and now <= season.data_release_deadline)),
        'proposal_count': season.proposals.count(),
    }


def get_accepting_season(now=None):
    now = now or datetime.utcnow()
    return ProposalSeason.query.filter(
        ProposalSeason.is_legacy.is_(False),
        ProposalSeason.start_date <= now,
        ProposalSeason.end_date >= now,
    ).order_by(ProposalSeason.start_date.desc(), ProposalSeason.id.desc()).first()


def can_submit_to_season(season, now=None):
    # Only pre-batch records can lack a season; the create endpoint always assigns one.
    return season is None or season_status(season, now) == 'accepting'


def can_allocate_to_season(season, now=None):
    # Unassigned historical records remain usable until the migration archives them.
    return bool(season is None or season.is_legacy or (
        season.data_release_deadline and (now or datetime.utcnow()) <= season.data_release_deadline
    ))
