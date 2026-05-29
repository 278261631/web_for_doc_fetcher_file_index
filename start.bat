@echo off
chcp 65001 >nul
title DocFetcher Web Server

echo ========================================
echo   DocFetcher Web - 代码索引搜索工具
echo ========================================
echo.
echo 服务器地址: http://127.0.0.1:8000
echo 按 Ctrl+C 停止服务器
echo.
echo 启动中...
echo.

cd /d "%~dp0"
C:\Python\Python310\python.exe main.py

pause
