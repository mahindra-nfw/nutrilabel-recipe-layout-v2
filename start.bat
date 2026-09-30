@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:5181/
  node server.js
) else (
  echo Node.js not found - falling back to Python on port 5181
  start "" http://localhost:5181/
  python -m http.server 5181
)
