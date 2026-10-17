@echo off
cd /d "%~dp0"
echo Save work and fully exit OpenCode Desktop. This builds and installs or updates the selectable theme.
node deploy.cjs prepare --upgrade
if errorlevel 1 goto failed
node deploy.cjs install
if errorlevel 1 goto failed
goto done
:failed
echo Refused or failed. Read the message above. Recovery files are preserved.
:done
pause
