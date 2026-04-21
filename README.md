# AstroPropose Astronomical Observing Proposal Management System

> **中文版本**: [README_CN.md](README_CN.md)

## Project Overview

AstroPropose is a general and customizable framework for astronomical observing proposal management, designed and implemented based on research papers. The system provides complete proposal lifecycle management, including user authentication, workflow design, proposal submission, and review processes.

## Key Features

- **User Authentication & Authorization**: JWT-based authentication system with Role-Based Access Control (RBAC)
- **Visual Workflow Editor**: Drag-and-drop workflow design supporting custom proposal approval processes
- **Dynamic Form System**: JSON-configurable dynamic form generation and validation
- **Proposal Type Management**: Flexible configuration for different types of observing proposals
- **Proposal Lifecycle Management**: Complete proposal submission, review, and status tracking
- **Modern UI**: Responsive interface built with Next.js and Tailwind CSS

## Technology Stack

### Backend
- **Framework**: Flask 2.2.2
- **Database**: PostgreSQL (Remote Server)
- **ORM**: SQLAlchemy 1.4.39
- **Authentication**: PyJWT 2.4.0
- **Package Manager**: [uv](https://github.com/astral-sh/uv)

### Frontend
- **Framework**: Next.js 13.4.12
- **UI Library**: React 18.2.0
- **Styling**: Tailwind CSS 3.3.3
- **Workflow**: XyFlow (@xyflow/react) 12.0.0+

## System Requirements

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) ≥ 0.5.0
- Node.js v18+
- PostgreSQL server access

## Quick Start

### 1. Clone the Project
```bash
git clone <repository-url>
cd src
```

### 2. Backend Setup (uv)

#### Environment Preparation & Dependency Installation
```bash
cd backend
uv sync
```

The command will create a `.venv/` managed by uv (or use `UV_PROJECT_ENVIRONMENT=.venv` to customise). Afterwards you can run backend scripts via `uv run ...` or by activating `.venv`.

#### Environment Variables Configuration
Copy the environment variables template and configure your settings:
```bash
cp env.example .env
# Edit the .env file to configure database connection and other settings
```

#### Database Configuration
Ensure the remote PostgreSQL server is accessible and the database `eops_framework_dev` has been created.

#### Database Migration
```bash
export FLASK_APP=run.py
flask db upgrade
```

#### Initialize Data
```bash
flask seed
```

#### Start Backend Server
```bash
uv run flask run --port 5001
```

The backend API will be available at `http://localhost:5001`.

### 3. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Start Development Server
```bash
npm run dev
```

The frontend application will be available at `http://localhost:3000`.

## User Guide

### First Access
1. Visit `http://localhost:3000`
2. Login with the default administrator account:
   - Username: `admin`
   - Password: `password`

### Main Features

#### Workflow Editor
- Visit `/admin/workflows` for workflow design
- Use drag-and-drop interface to create and edit workflows
- Support node connections and state configuration

#### Proposal Management
- Visit `/proposals/new` to create new proposals
- Select proposal types and fill out forms
- Track proposal status and review progress

#### User Management
- User registration and login
- Role assignment and permission management
- Personal dashboard

## Project Structure

```
src/
├── backend/                 # Flask Backend Application
│   ├── app/
│   │   ├── api/            # RESTful API Endpoints
│   │   │   ├── auth.py     # Authentication APIs
│   │   │   ├── proposals.py # Proposal Management APIs
│   │   │   └── workflows.py # Workflow Management APIs
│   │   ├── models/         # Database Models
│   │   └── core/           # Core Business Logic
│   ├── migrations/         # Database Migration Files
│   └── pyproject.toml      # Python Dependencies managed by uv
├── frontend/               # Next.js Frontend Application
│   ├── app/               # Page Components
│   │   ├── admin/         # Admin Pages
│   │   ├── proposals/     # Proposal Related Pages
│   │   └── dashboard/     # User Dashboard
│   ├── components/        # Reusable Components
│   └── lib/              # Utility Libraries
└── README.md             # Project Documentation
```

## API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User Login
- `POST /api/auth/register` - User Registration
- `GET /api/auth/profile` - Get User Information

### Proposal Endpoints
- `GET /api/proposals` - Get Proposal List
- `POST /api/proposals` - Create New Proposal
- `GET /api/proposals/<id>` - Get Proposal Details
- `PUT /api/proposals/<id>` - Update Proposal

### Workflow Endpoints
- `GET /api/workflows` - Get Workflow List
- `POST /api/workflows` - Create Workflow
- `PUT /api/workflows/<id>` - Update Workflow

## Development Guide

### Database Models
- **User**: User information management
- **Role**: Role definitions
- **Proposal**: Proposal data
- **Workflow**: Workflow definitions
- **FormTemplate**: Form templates

### Frontend Components
- **WorkflowEditor**: Visual workflow editor
- **Navbar**: Navigation bar component
- **Dynamic Forms**: Configuration-based form generator

## Core Functionality

### User Authentication & RBAC
The system implements a comprehensive authentication system using JWT tokens and role-based access control. Users can be assigned different roles (admin, reviewer, proposer) with corresponding permissions.

### Visual Workflow Editor
The workflow editor allows administrators to design custom approval processes using a drag-and-drop interface. Workflows can include multiple states, transitions, and approval steps.

### Dynamic Form System
Forms are generated dynamically based on JSON configurations, allowing for flexible form creation without code changes. The system supports various input types and validation rules.

### Proposal Lifecycle Management
Proposals follow a defined workflow from creation to final approval. Each proposal has a current state and can transition through different stages based on the configured workflow.

## Security Guidelines

### Environment Variables and Sensitive Information
- Ensure `.env` file is added to `.gitignore`
- Never hardcode database passwords, API keys, or other sensitive information in code
- Use environment variables to manage configuration
- Regularly update keys and passwords

### Production Deployment
- Use strong passwords and keys
- Enable HTTPS
- Configure appropriate CORS policies
- Set secure session configurations

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL server status
   - Verify database connection string
   - Confirm network connectivity

2. **Frontend Dependency Installation Failed**
   - Clear node_modules and reinstall
   - Check Node.js version compatibility

3. **API Request Failed**
   - Confirm backend service is running
   - Check CORS configuration
   - Verify JWT token validity

## Deployment

### Production Setup
1. Configure environment variables
2. Set up production database
3. Build frontend for production
4. Deploy using your preferred method (Docker, cloud platforms, etc.)

### Environment Variables
```bash
DATABASE_URL=postgresql://user:password@host:port/database
SECRET_KEY=your-secret-key
FLASK_ENV=production
```

## Contributing

1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Citation

If you use AstroPropose in research or software publications, please cite:

```bibtex
@article{xu2026managing,
  title={Managing astronomical observing proposals with AstroPropose: A customizable framework applied to the Einstein Probe mission},
  author={Xu, Yunfei and Zhang, Zhen and Mi, Linying and Hu, Jingwei and Li, Shanshan and Li, Dongyue and Jin, Chichuan and Chen, Lang and Fan, Dongwei and Li, Changhua and others},
  journal={Astronomy and Computing},
  pages={101080},
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For questions or suggestions, please contact:
- Project Issues: [GitHub Issues](https://github.com/xx70235/AstroPropose/issues)
- Email: xuyf@nao.cas.cn

## Acknowledgments

This project is based on research in astronomical proposal management systems and aims to provide a flexible, scalable solution for observatories and research institutions.
