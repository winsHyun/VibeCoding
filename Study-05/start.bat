@echo off
rem 작성일시: 2026-10-27 15:35
rem AI 공감 다이어리 서버 실행 후 브라우저로 http://127.0.0.1:3000 을 연다
title AI 공감 다이어리 서버
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요. & pause & exit /b 1)

if not exist node_modules (
  echo 처음 실행이라 필요한 패키지를 설치합니다...
  call npm install || (pause & exit /b 1)
)

echo 서버를 시작합니다. 잠시 후 브라우저가 열립니다.
echo 이 창을 닫으면 서버가 종료됩니다.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:3000"
node server.js
pause
