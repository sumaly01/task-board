FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

# Run in dev mode so Next.js compiles pages on-the-fly.
# Day 7: swap to `npm run build && npm run start` for production.
CMD ["npm", "run", "dev"]
