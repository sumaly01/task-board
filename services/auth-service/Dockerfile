FROM node:20-slim

# Prisma's query engine binary links against OpenSSL at runtime.
# node:20-slim is Debian Bookworm — openssl provides libssl3 (OpenSSL 3.x).
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

# @prisma/client postinstall sometimes misses running `prisma generate` because
# the prisma CLI is still being installed at that point. Running it explicitly
# here guarantees the typed client (User, etc.) is generated before tsc runs.
RUN npx prisma generate

RUN npm run build

EXPOSE 4001

# prisma migrate deploy applies any pending migrations before the server starts.
# Safe to run on every restart — already-applied migrations are skipped.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
