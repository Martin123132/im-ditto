@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "ditto\launch.mjs"
) else (
  node "ditto\launch.mjs"
)
if errorlevel 1 pause
