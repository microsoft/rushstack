@ECHO OFF

REM This script follows the same pattern as an NPM binary wrapper batch file on Windows

echo Executing npm-binary-wrapper.cmd with args:
echo "%*"

SETLOCAL
SET PATHEXT=%PATHEXT:;.JS;=;%
node  "%~dp0\javascript-file.js" %*
