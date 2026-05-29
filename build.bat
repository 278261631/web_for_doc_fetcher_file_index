@echo off
chcp 65001 >nul
title DocFetcher Build
cd /d "%~dp0"

echo ========================================
echo   DocFetcher - 构建脚本
echo ========================================
echo.

REM 检查 Java 版本
echo 检查 Java 版本...
java -version 2>&1 | findstr "11"
if %errorlevel% neq 0 (
    echo.
    echo ⚠️  警告: 未检测到 Java 11，尝试使用其他版本...
    java -version
)

echo.
echo 正在构建 DocFetcher...
echo.

REM 使用 Python 构建脚本
cd docfetcher-src
python build.py

if %errorlevel% equ 0 (
    echo.
    echo ✅ 构建成功！
    echo.
    echo 构建输出目录: docfetcher-src\build\DocFetcher-1.1.9
    dir docfetcher-src\build\DocFetcher-1.1.9\lib\*.jar /b | find /c /v ""
    echo 个 JAR 文件
) else (
    echo.
    echo ❌ 构建失败！
    echo.
    echo 请检查:
    echo   1. Java 11+ 是否已安装
    echo   2. docfetcher-src 子模块是否已更新
    echo      git submodule update --init --recursive
)

echo.
pause
