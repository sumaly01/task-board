FROM node:20-alpine

WORKDIR /app

# Copy all files first so npm install has access to everything it needs
COPY . .

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm install

# Compile TypeScript → dist/
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
