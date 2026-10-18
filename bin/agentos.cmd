@echo off
rem Launcher de AgentOS: corre .\bin\agentos.cmd start desde la carpeta de AgentOS (no se instala en el PATH).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agentos.ps1" %*
