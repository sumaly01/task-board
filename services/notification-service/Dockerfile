FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

# Compile TypeScript → dist/
RUN npm run build

EXPOSE 4003

CMD ["node", "dist/index.js"]
