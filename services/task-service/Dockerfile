FROM node:20-slim

RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

RUN npx prisma generate

RUN npm run build

EXPOSE 4002

CMD ["node", "dist/index.js"]
