FROM node:20-slim

# openssl — required by Prisma's query engine on Debian
# wget — used by Docker healthcheck
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY prisma ./prisma
COPY package*.json ./
RUN npm install

# Generate the Prisma client from schema.prisma (creates TypeScript types
# and the native query engine binary matching this image's OS/architecture).
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4003

CMD ["node", "dist/index.js"]
