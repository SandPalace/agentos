@echo off
rem Atajo para correr el launcher desde el repo sin instalar (install.ps1 genera su propia copia en %USERPROFILE%\.agentos\bin).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agentos.ps1" %*
