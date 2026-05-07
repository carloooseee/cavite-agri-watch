@echo off
echo Setting up Cavite Agri-Watch...

echo.
echo [1/2] Installing frontend dependencies...
cd frontend && npm install && cd ..

echo.
echo [2/2] Setting up backend virtual environment...
cd backend
python -m venv venv
call .\venv\Scripts\activate
pip install -r requirements.txt
cd ..

echo.
echo Setup complete! You can now run "npm run dev" or "dev.bat" to start the application.
pause
