@echo off
REM Always use .cjs — immune to package.json "type":"module"
node "%~dp0orquestra.cjs" %*
