@echo off
setlocal enabledelayedexpansion
title WebAR Test Runner
cd /d "%~dp0"

:MENU
cls
echo ========================================================
echo        EXPERIENCIA WEBAR - MINDAR + THREE.JS
echo ========================================================
echo.
echo  [Y] Iniciar servidor local y abrir en el navegador
echo  [N] Salir
echo.
echo ========================================================
echo.

choice /c YN /n /m "Ingresa tu opcion [Y / N]: "
if errorlevel 2 goto SALIR
if errorlevel 1 goto INICIAR

:INICIAR
cls
echo ========================================================
echo               INICIANDO SERVIDOR WEBAR
echo ========================================================
echo.

:: Sincronizar nombres del target para evitar discrepancias singular/plural
if exist "targets\targets.mind" (
    if not exist "targets\target.mind" copy /y "targets\targets.mind" "targets\target.mind" >nul 2>&1
)
if exist "targets\target.mind" (
    if not exist "targets\targets.mind" copy /y "targets\target.mind" "targets\targets.mind" >nul 2>&1
)
if exist "targets.mind" (
    if not exist "targets\targets.mind" copy /y "targets.mind" "targets\targets.mind" >nul 2>&1
    if not exist "targets\target.mind" copy /y "targets.mind" "targets\target.mind" >nul 2>&1
)

:: Liberar puerto 8000 si estuviera ocupado previamente
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Iniciar servidor HTTP en segundo plano (prioridad Python, alternativa Node)
where python >nul 2>&1
if %errorlevel% equ 0 (
    if exist "server.py" (
        start "WebAR_Server" /min python server.py
    ) else (
        start "WebAR_Server" /min python -m http.server 8000
    )
) else (
    where npx >nul 2>&1
    if %errorlevel% equ 0 (
        start "WebAR_Server" /min npx serve . -l 8000
    ) else (
        echo [ERROR] No se encontro Python ni Node.js en el sistema.
        pause
        goto SALIR
    )
)

:: Breve pausa para asegurar inicio del servidor
ping -n 2 127.0.0.1 >nul

:: Abrir navegador predeterminado
start http://localhost:8000

cls
echo ========================================================
echo            SERVIDOR WEBAR EN EJECUCION
echo ========================================================
echo.
echo  * URL Local:      http://localhost:8000
echo  * Estado:         ACTIVO
echo.
echo  Para probar desde tu celular en la misma red Wi-Fi:
echo    npx cloudflared tunnel --url http://localhost:8000
echo.
echo ========================================================
echo.
echo  El servidor esta corriendo en segundo plano.
echo  Presiona [N] en cualquier momento para detenerlo.
echo.

:ESPERAR_CIERRE
choice /c N /n /m "Escribe 'N' para cerrar el servidor: "
if errorlevel 1 goto DETENER
goto ESPERAR_CIERRE

:DETENER
cls
echo ========================================================
echo               DETENIENDO SERVIDOR...
echo ========================================================
echo.

:: Cerrar ventana del servidor por titulo
taskkill /FI "WINDOWTITLE eq WebAR_Server*" /F /T >nul 2>&1

:: Asegurar liberacion de puerto 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] Servidor WebAR detenido correctamente.
ping -n 2 127.0.0.1 >nul
goto SALIR

:SALIR
exit /b
