@echo off
title MedBlock-Share Full-Stack Architecture
echo ===============================================================================
echo  MedBlock-Share: Decentralized Patient-Centric EHR Sharing
echo  via Proxy Re-Encryption, Emergency Tele-Triage & Tamper-Alert Proxy Forensics
echo ===============================================================================
echo.
echo [*] Starting MedBlock-Share Unified Full-Stack Server on http://localhost:4000 ...
echo [*] Open your web browser at: http://localhost:4000
echo.
node "%~dp0server\app_server.js"
pause
