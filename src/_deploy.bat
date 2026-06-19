@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "UI/UX updates: yellow error bar, coin emoji, calendar Sun-Sat redesign, holiday highlights, no-wage blue cells, wage deletion dialog, max 6 wages, date range limit, daysWithoutWage warning"
git push
pause
