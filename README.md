# MediClaim Pro

Medical insurance claim management app with a static frontend and a Flask API backend.

## Current project structure

- `frontend/` - UI pages, styles, and JavaScript modules.
- `api/` - Flask REST API and backend dependencies.
- `utils/` - shared utility modules used by the API.
- `archive_legacy/` - archived legacy scripts that are not part of the active app flow.

## Run backend + frontend (recommended)

1. Start the API:

   ```bash
   cd api
   pip install -r requirements.txt
   python app.py
   ```

   API will run at `http://localhost:5000`.

2. Start the frontend:
   - Open `frontend/index.html` with Live Server, or
   - Serve the `frontend/` folder using any static server.

3. Use the app:
   - Register/login as user.
   - File claims and upload documents.
   - Login as admin to review claims.

## Notes

- Active API backend uses PostgreSQL + MongoDB connections from `api/app.py`.
- `archive_legacy/` contains older backend scripts kept only for reference.
