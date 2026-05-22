FROM node:20-slim

RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

RUN npx prisma generate

RUN npm run build

EXPOSE 4002

# prisma migrate deploy applies any pending migrations before the server starts.
# It is safe to run on every container start — already-applied migrations are skipped.
# Never use migrate dev in Docker: that's for local development only (it generates
# new migration files). migrate deploy only applies existing migration files.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
