FROM node:20-alpine

WORKDIR /app

# Copy all files including prisma/schema.prisma so @prisma/client postinstall
# can run `prisma generate`. If prisma/ is not present when npm install runs,
# the Prisma client generation step will fail.
COPY . .

# Install all dependencies. @prisma/client postinstall runs `prisma generate`
# against prisma/schema.prisma. On Day 1 the schema has no models yet,
# which is fine — it generates an empty client.
RUN npm install

# Compile TypeScript → dist/
RUN npm run build

EXPOSE 4001

CMD ["node", "dist/index.js"]
