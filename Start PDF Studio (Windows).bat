@echo off
title PDF Studio
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start\server.ps1" -Root "%~dp0."
