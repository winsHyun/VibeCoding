@echo off
rem 작성일시: 2026-10-26 14:52
rem 데모 모드 실행 (AI 호출 없이 예시 결과로 화면 흐름만 테스트)
title 냉장고 레시피 서버 - 데모 모드
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요. & pause & exit /b 1)

if not exist node_modules (
  echo 처음 실행이라 필요한 패키지를 설치합니다...
  call npm install || (pause & exit /b 1)
)

echo 서버를 시작합니다. 잠시 후 브라우저가 열립니다.
echo 이 창을 닫으면 서버가 종료됩니다.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
node server.js --demo
pause
