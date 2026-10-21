@echo off
rem 윈도우 탐색기에서 이 파일을 더블클릭하면 숫자 인식기가 실행된다.
rem 로컬 서버를 시작하고 기본 브라우저에서 앱을 연다.

title Digit Recognizer
rem 어디서 실행하든 이 스크립트가 있는 폴더를 기준으로 동작한다.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)

node server.js

rem 실패하면 오류 메시지를 읽을 수 있도록 창을 열어 둔다.
if errorlevel 1 pause
