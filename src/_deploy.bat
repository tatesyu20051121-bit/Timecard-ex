@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "Replace native time picker with custom hour/minute input"
git push
pause
