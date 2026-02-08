@echo off
echo ========================================
echo     Case 质量检测工具 - 启动脚本
echo ========================================
echo.

set PATH=d:\case质量检测\node-v20.11.1-win-x64;%PATH%

echo [1/2] 启动后端服务...
start "Backend" cmd /c "cd /d d:\case质量检测\backend && node server.js"

timeout /t 3 /nobreak > nul

echo [2/2] 启动前端服务...
start "Frontend" cmd /c "cd /d d:\case质量检测\frontend && npm run dev"

echo.
echo ========================================
echo 服务启动中...
echo 后端: http://localhost:3001
echo 前端: http://localhost:3000
echo ========================================
echo.
pause
