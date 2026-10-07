@echo off
cd /d "%~dp0"
node deploy.cjs restore
if errorlevel 1 echo Restore refused or failed. Read the message above.
pause
