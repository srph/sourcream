.PHONY: install start

install:
	npm install
	node -e "const fs=require('fs');if(!fs.existsSync('.env'))fs.copyFileSync('.env.example','.env')"
	npm run db:migrate
	npm run build

start:
	npm start
