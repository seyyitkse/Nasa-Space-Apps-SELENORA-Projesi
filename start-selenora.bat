@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title SELENORA launcher
echo.
echo  SELENORA — starting backend + frontend
echo  =====================================
echo.

if not exist "backend\.venv\Scripts\python.exe" (
  echo [ERROR] backend\.venv not found.
  echo         Run once:  cd backend ^& python -m venv .venv ^& .venv\Scripts\python.exe -m pip install -e ".[dev]"
  pause
  exit /b 1
)

if not exist "frontend\node_modules\" (
  echo [INFO] frontend\node_modules missing — running npm install...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "backend\.env" (
  if exist "backend\.env.example" (
    echo [INFO] Creating backend\.env from .env.example
    copy /Y "backend\.env.example" "backend\.env" >nul
  )
)

echo [1/2] Backend  http://127.0.0.1:8000
start "SELENORA Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Frontend http://localhost:5173
start "SELENORA Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo  Opened two terminal windows. Close them to stop the servers.
echo  API docs: http://127.0.0.1:8000/docs
echo.
pause
endlocal
