@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "Fix TimePicker: selected number hidden by highlight on Android"
git push
pause
