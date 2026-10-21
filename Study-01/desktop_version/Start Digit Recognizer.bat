@echo off
rem 작성일시: 2026-10-21 16:45
rem 윈도우 탐색기에서 이 파일을 더블클릭하면 데스크톱 숫자 인식기가 실행된다.
rem 처음 실행할 때는 필요한 패키지(Electron, TensorFlow.js)를 먼저 설치한다.

title Digit Recognizer (Desktop)
rem 어디서 실행하든 이 스크립트가 있는 폴더를 기준으로 동작한다.
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)

if not exist "node_modules\@tensorflow\tfjs" (
    echo Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

rem Electron 실행 파일은 설치 시가 아니라 처음 require 할 때 내려받아진다.
if not exist "node_modules\electron\dist\electron.exe" (
    echo Downloading Electron, please wait...
    node -e "require('electron')"
    if errorlevel 1 (
        echo Electron download failed.
        pause
        exit /b 1
    )
)

rem 콘솔 창은 닫고 앱 창만 남긴다.
start "" "node_modules\electron\dist\electron.exe" .
