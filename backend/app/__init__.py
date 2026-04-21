import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from config import Config
# import redis # Redis is disabled

db = SQLAlchemy()
migrate = Migrate()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app) # Allow cross-origin requests

    # Redis is disabled for now
    # if app.config['REDIS_URL']:
    #     app.redis = redis.from_url(app.config['REDIS_URL'])
    # else:
    #     app.redis = None

    # Register blueprints
    from app.api.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth', strict_slashes=False)

    from app.api.proposals import bp as proposals_bp
    app.register_blueprint(proposals_bp, url_prefix='/api/proposals', strict_slashes=False)

    from app.api.workflows import bp as workflows_bp
    app.register_blueprint(workflows_bp, url_prefix='/api/workflows', strict_slashes=False)
    
    from app.api.form_templates import bp as form_templates_bp
    app.register_blueprint(form_templates_bp, url_prefix='/api/form-templates', strict_slashes=False)

    from app.api.proposal_types import bp as proposal_types_bp
    app.register_blueprint(proposal_types_bp, url_prefix='/api/proposal-types', strict_slashes=False)

    from app.api.instruments import bp as instruments_bp
    app.register_blueprint(instruments_bp, url_prefix='/api/instruments', strict_slashes=False)

    from app.api.external_tools import bp as external_tools_bp
    app.register_blueprint(external_tools_bp, url_prefix='/api/external-tools', strict_slashes=False)

    from app.api.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix='/api/admin', strict_slashes=False)

    @app.route('/ping')
    def ping():
        return 'pong!'

    return app
