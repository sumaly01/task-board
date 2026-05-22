import { PrismaClient } from '@prisma/client';

// One PrismaClient instance per process — manages a connection pool to PostgreSQL.
// Creating a new instance per request would exhaust the DB connection limit under load.
const prisma = new PrismaClient();

export default prisma;
