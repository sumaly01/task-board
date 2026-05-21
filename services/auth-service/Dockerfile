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

CMD ["node", "dist/index.js"]
