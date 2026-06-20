@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "Show break-only records in detail panel; fix time picker reset/cancel behavior"
git push
pause
