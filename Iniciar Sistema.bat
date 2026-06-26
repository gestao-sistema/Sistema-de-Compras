@echo off
title Sistema de Compras - Alinare
color 0A

echo.
echo  ================================================
echo   ALINARE - Sistema de Compras
echo  ================================================
echo.

:: Fecha processos Node anteriores
echo  Encerrando processos anteriores...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Inicia o backend
echo  Iniciando Backend (porta 3001)...
start "Backend - Alinare" cmd /k "cd /d "%~dp0backend" && node server.js"
timeout /t 4 /nobreak >nul

:: Inicia o frontend
echo  Iniciando Frontend (porta 5173)...
start "Frontend - Alinare" cmd /k "cd /d "%~dp0" && npx vite --port 5173"
timeout /t 6 /nobreak >nul

:: Abre o navegador
echo  Abrindo navegador...
start "" "http://localhost:5173"

echo.
echo  Sistema iniciado! Acesse: http://localhost:5173
echo.
echo  Para encerrar, feche as janelas "Backend" e "Frontend".
echo.
pause
