import { PrismaClient } from '@prisma/client';

// Singleton: one PrismaClient for the entire process.
// Creating a new client per request would exhaust the DB connection pool.
const prisma = new PrismaClient();

export default prisma;
