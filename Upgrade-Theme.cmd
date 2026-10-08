@echo off
cd /d "%~dp0"
echo Save your work and fully exit OpenCode Desktop before installing.
node deploy.cjs prepare --upgrade
if errorlevel 1 goto failed
node deploy.cjs install
if errorlevel 1 goto failed
goto done
:failed
echo Upgrade refused or failed. Read the message above. Existing backups are preserved.
:done
pause
