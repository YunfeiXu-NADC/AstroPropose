from app import create_app, db
from app.models.models import User, Role, Proposal, Workflow, FormTemplate, ProposalType, roles_users
import click

app = create_app()

@app.cli.command("seed")
def seed():
    """Add seed data to the database."""
    print("Seeding database...")
    
    # Clear existing data in the correct order
    db.session.execute(roles_users.delete())
    db.session.query(Proposal).delete()
    db.session.query(User).delete()
    db.session.query(ProposalType).delete()
    db.session.query(Workflow).delete()
    db.session.query(Role).delete()
    db.session.query(FormTemplate).delete()
    db.session.commit()

    # Create built-in roles and a default admin user.
    admin_role = Role(name='Admin', is_system=True)
    proposer_role = Role(name='Proposer', is_system=True)
    panel_chair_role = Role(name='Panel Chair', is_system=True)
    instrument_scheduler_role = Role(name='Instrument Scheduler', is_system=True)
    db.session.add_all([admin_role, proposer_role, panel_chair_role, instrument_scheduler_role])

    admin_user = User(username='admin', email='admin@example.com', is_active=True)
    admin_user.set_password('password')
    admin_user.roles.append(admin_role)
    admin_user.roles.append(proposer_role)
    db.session.add(admin_user)
    db.session.commit()

    # Create Workflows
    fsto_workflow = Workflow(name='FSTO Workflow', description='Standard multi-stage peer review.')
    too_workflow = Workflow(name='ToO Workflow', description='Rapid review by Duty Scientist.')
    toomm_workflow = Workflow(name='ToO-MM Workflow', description='Fully automated machine-to-machine workflow.')
    db.session.add_all([fsto_workflow, too_workflow, toomm_workflow])
    db.session.commit()

    # Create Proposal Types and link them to Workflows
    pt_fsto = ProposalType(name='FSTO', description='FXT Survey Target Observation', workflow_id=fsto_workflow.id)
    pt_too = ProposalType(name='ToO', description='Target of Opportunity', workflow_id=too_workflow.id)
    pt_toomm = ProposalType(name='ToO-MM', description='Multi-Messenger ToO', workflow_id=toomm_workflow.id)
    db.session.add_all([pt_fsto, pt_too, pt_toomm])
    db.session.commit()
    
    print("Database seeded!")


@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'User': User, 'Role': Role, 'Proposal': Proposal, 'ProposalType': ProposalType}
