#!/usr/bin/env python3

from app import create_app
from app.models.models import User


def main():
    app = create_app()
    with app.app_context():
        user = User.query.filter_by(username='admin').first()
        print(f'User found: {user.username if user else None}')
        print(f'Roles: {[role.name for role in user.roles] if user else None}')
        if user:
            print(f'Password check: {user.check_password("password")}')


if __name__ == "__main__":
    main()




