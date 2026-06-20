@echo off
cd /d C:\tc\timecard-app
git rm src\_deploy.bat
git rm src\_cleanup.bat
git commit -m "Remove deploy scripts"
git push
exit
