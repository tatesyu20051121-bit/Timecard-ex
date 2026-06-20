@echo off
cd /d C:\tc\timecard-app
git add -A
git commit -m "Fix TimePicker clipping: use createPortal to render outside BottomSheet"
git push
pause
