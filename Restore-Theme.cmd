@echo off
cd /d "%~dp0"
echo Save work and fully exit OpenCode Desktop. This restores the official original app.
node deploy.cjs restore
pause
