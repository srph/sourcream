.PHONY: install dev build start

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
