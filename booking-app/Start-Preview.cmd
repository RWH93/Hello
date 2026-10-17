@echo off
cd /d "%~dp0"
echo R and R Detailing - local development preview
echo Keep this window open while testing.
echo Open http://127.0.0.1:4174/admin in your browser.
echo Use test details only. This is not the live website.
node server.mjs
pause
