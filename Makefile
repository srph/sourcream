.PHONY: install dev build start install\:tray build\:tray

install:
	npm install
	node -e "const fs=require('fs');if(!fs.existsSync('.env'))fs.copyFileSync('.env.example','.env')"
	npm run db:migrate
	npm run build

dev:
	npm run dev

build:
	npm run build

start: build
	npm start

install\:tray:
	powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tray\install-deps.ps1

build\:tray:
	powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tray\install-deps.ps1
	powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tray\build.ps1
