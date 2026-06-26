@echo off
title Sistema de Compras - Alinare
echo Iniciando Sistema de Compras...
echo.

cd /d "%~dp0"

:: Backend
start "Backend API" /min cmd /c "node backend/server.js"
timeout /t 3 /nobreak > nul

:: Frontend
start "Frontend Vite" /min cmd /c "npx vite"
timeout /t 5 /nobreak > nul

echo Sistema iniciado!
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
start "" "http://localhost:5173"

echo Mantenha esta janela aberta. Feche para encerrar o sistema.
pause
