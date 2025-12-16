# Prompting Realities

A full-stack web application for exploring and managing conversational prompting realities, built with Next.js (frontend) and FastAPI (backend).

## Project Structure

```
prompting-realities-webapp/
├── frontend/          # Next.js web application
├── backend/           # FastAPI backend server
├── start_frontend.sh  # Script to start frontend
├── start_backend.sh   # Script to start backend
└── README.md         # This file
```

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher) and **npm**
- **Python** (v3.8 or higher) and **pip**
- **Git**

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/MahanMehrvarz/Prompting-Realities-Webapp.git
cd Prompting-Realities-Webapp
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env.local` file in the `frontend/` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

(Optional) Create a `.env` file in the `backend/` directory for any configuration:

```env
DATABASE_URL=sqlite:///./app.db
SECRET_KEY=your-secret-key-here
```

## Running the Application

### Option 1: Using Start Scripts (Recommended)

From the root directory:

**Start Backend:**
```bash
./start_backend.sh
```
This will start the backend server on `http://0.0.0.0:8000`

**Start Frontend (in a new terminal):**
```bash
./start_frontend.sh
```
This will start the frontend on `http://192.168.1.15:3000`

### Option 2: Manual Start

**Backend:**
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## API Documentation

Once the backend is running, you can access:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Development

### Frontend (Next.js + TypeScript)
- **Framework**: Next.js 14+ with App Router
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Location**: `frontend/`

### Backend (FastAPI + Python)
- **Framework**: FastAPI
- **Database**: SQLAlchemy ORM with SQLite
- **Authentication**: JWT tokens with bcrypt
- **Real-time**: MQTT support with paho-mqtt
- **Location**: `backend/`

## Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend
- FastAPI
- SQLAlchemy
- Paho-MQTT
- Uvicorn
- Python 3.x

## Collaboration

### Before Making Changes
1. Pull the latest changes: `git pull origin main`
2. Create a new branch: `git checkout -b feature/your-feature-name`

### After Making Changes
1. Stage your changes: `git add .`
2. Commit: `git commit -m "Description of changes"`
3. Push: `git push origin feature/your-feature-name`
4. Create a Pull Request on GitHub

## Troubleshooting

### Port Already in Use
If you get an error about ports already being in use:
- **Backend (8000)**: Kill the process using `lsof -ti:8000 | xargs kill -9`
- **Frontend (3000)**: Kill the process using `lsof -ti:3000 | xargs kill -9`

### Module Not Found
- Frontend: Make sure you ran `npm install` in the `frontend/` directory
- Backend: Make sure you ran `pip install -r requirements.txt` in the `backend/` directory

### Database Issues
Delete the `backend/app.db` file and restart the backend to reinitialize the database.

## License

[Add your license here]

## Contributors

- Mahan Mehrvarz
- [Add collaborators here]
