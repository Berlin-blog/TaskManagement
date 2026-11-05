@echo off
setlocal
title 任务排期管理
cd /d "%~dp0"
if not exist package.json (
    echo [X] 找不到项目目录，请把本脚本放到项目根目录运行。
    pause
    exit /b 1
)

echo ================================================
echo           任务排期管理 - 一键启动
echo ================================================
echo.

netstat -ano | findstr :3001 | findstr LISTENING >nul 2>nul
if %errorlevel%==0 (
    echo [OK] 服务已在运行，直接打开页面...
    start "" http://localhost:3001
    ping -n 3 127.0.0.1 >nul
    exit /b
)

if not exist node_modules (
    echo [..] 首次运行，正在安装前端依赖，约 1 分钟...
    call npm install --silent
    if errorlevel 1 goto install_failed
)
if not exist server\node_modules (
    echo [..] 正在安装后端依赖...
    pushd server
    call npm install --silent
    if errorlevel 1 (
        popd
        goto install_failed
    )
    popd
)

echo [..] 正在检查类型并构建前端...
call npm run build
if errorlevel 1 (
    echo.
    echo [X] 构建失败，请查看上面的 TypeScript / Vite 错误。
    pause
    exit /b 1
)

echo [..] 正在启动服务...
start "任务排期-服务（关闭此窗口即停止服务）" /min cmd /c "node server\index.js"

echo [..] 等待服务就绪...
set /a tries=0
:wait
ping -n 2 127.0.0.1 >nul
set /a tries+=1
curl -s http://localhost:3001/api/health 2>nul | findstr "ok" >nul 2>nul
if %errorlevel%==0 goto ready
if %tries% geq 20 goto failed
goto wait

:ready
echo.
echo ================================================
echo   [OK] 启动成功！浏览器即将打开 http://localhost:3001
echo   提示：数据保存在本机 MySQL，可长期使用
echo   停止服务：关闭任务栏"任务排期-服务"窗口
echo ================================================
start "" http://localhost:3001
ping -n 4 127.0.0.1 >nul
exit /b

:failed
echo.
echo [X] 服务启动失败，常见原因：
echo     1. MySQL 未启动 - 请在"服务"中启动 MySQL84
echo     2. 数据库 task_schedule 不存在 - 执行:
echo        CREATE DATABASE task_schedule DEFAULT CHARSET utf8mb4;
echo     3. 账号密码不对 - 编辑 server\.env
echo.
echo 详细错误信息见"任务排期-服务"窗口。
pause
exit /b 1

:install_failed
echo.
echo [X] 依赖安装失败，请检查网络或 npm 配置。
pause
exit /b 1