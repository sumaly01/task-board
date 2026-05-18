FROM node:20-alpine

WORKDIR /app

# Copy all files including prisma/schema.prisma so @prisma/client postinstall
# can run `prisma generate` during npm install.
COPY . .

RUN npm install

# Compile TypeScript → dist/
RUN npm run build

EXPOSE 4002

CMD ["node", "dist/index.js"]
