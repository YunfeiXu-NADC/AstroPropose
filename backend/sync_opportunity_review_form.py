"""Update only the opportunity technical review form binding in an existing database."""

from app import create_app, db
from app.models.models import FormTemplate, Workflow
from seed_dsl_rps_workflows import load_presets


def sync():
    preset = next(item for item in load_presets()['forms'] if item['key'] == 'rapid_technical_review')
    with create_app().app_context():
        template = FormTemplate.query.filter_by(name=preset['name']).first()
        if template is None:
            template = FormTemplate(name=preset['name'])
            db.session.add(template)
        template.phase = preset['phase']
        template.definition = preset['definition']
        db.session.flush()

        workflow = Workflow.query.filter_by(name='DSL 机遇观测提案流程').one()
        definition = dict(workflow.definition or {})
        nodes = [dict(node) for node in definition.get('nodes', [])]
        technical = next(node for node in nodes if node.get('id') == 'technical')
        technical['data'] = {
            **(technical.get('data') or {}),
            'formKey': preset['key'],
            'formTemplateId': template.id,
        }
        workflow.definition = {**definition, 'nodes': nodes}
        db.session.commit()
        print(f'Opportunity technical review form: {template.id}')


if __name__ == '__main__':
    sync()
