@echo off
cd /d "%~dp0"
node deploy.cjs install
if errorlevel 1 echo Installation refused or failed. Read the message above.
pause
