@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "Other-month dates: same tap behavior as current month"
git push
pause
