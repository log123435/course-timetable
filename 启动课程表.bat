@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 课迹课程表正在启动...
echo 请让手机和电脑连接同一个 Wi-Fi。
echo 手机访问地址请使用下面任意一个局域网 IPv4 地址，并在末尾加上 :8765
ipconfig | findstr /R /C:"IPv4"
echo 关闭此窗口即可停止服务。
echo.
python -m http.server 8765 --bind 0.0.0.0
pause
