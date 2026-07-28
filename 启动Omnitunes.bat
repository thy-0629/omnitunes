@echo off
REM Omnitunes 一键启动：后端 + 前端 + 自动打开浏览器
cd /d "%~dp0"

echo [1/3] 启动后端 API (:3000)...
start "Omnitunes Backend" /min cmd /k "pnpm dev"

echo [2/3] 启动前端页面 (:5173)...
start "Omnitunes Web" /min cmd /k "pnpm dev:web"

echo [3/3] 等待服务就绪...
:wait
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:5173/ 2>nul | findstr /b "200" >nul
if errorlevel 1 goto wait

echo 打开浏览器...
start http://localhost:5173

echo.
echo Omnitunes 已启动！关闭本窗口不影响服务。
echo 要停止服务：关掉 "Omnitunes Backend" 和 "Omnitunes Web" 两个窗口即可。
pause
