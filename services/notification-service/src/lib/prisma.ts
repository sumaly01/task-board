import { PrismaClient } from '@prisma/client';

// Singleton client pointing at task_db (read by cron job for due-date queries).
// Notification-service never runs migrations on this DB — task-service owns it.
const prisma = new PrismaClient();
export default prisma;
