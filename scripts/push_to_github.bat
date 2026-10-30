@echo off
title Push MedBlock-Share to Sajeev Network Solutions GitHub
echo ===============================================================================
echo  Pushing MedBlock-Share to GitHub: sajeevnetworksolutions-lgtm/MedBlock-Share
echo ===============================================================================
echo.
cd /d "%~dp0.."
git push -u origin main
echo.
pause
