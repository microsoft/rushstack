@ECHO OFF
@SETLOCAL
cmd /c "(cd ..\.. && node "%~dp0\lib\rush" %*)"
