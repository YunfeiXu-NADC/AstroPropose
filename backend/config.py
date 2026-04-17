import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
project_root = os.path.abspath(os.path.join(basedir, os.pardir))

# Support both repo-root `.env` (as documented in README) and `backend/.env`.
for env_path in (os.path.join(project_root, ".env"), os.path.join(basedir, ".env")):
    load_dotenv(env_path)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-hard-to-guess-string'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Redis is disabled for now
    REDIS_URL = None
