import { User } from '@prisma/client';
import prisma from '../lib/prisma';

// Repository layer: all Prisma calls for the User model live here.
// The service layer never imports prisma directly — it only calls these functions.
// This gives us a seam for mocking in tests without touching the real DB.

export const findUserByEmail = async (email: string): Promise<User | null> => {
  return prisma.user.findUnique({ where: { email } });
};

export const findUserById = async (id: string): Promise<User | null> => {
  return prisma.user.findUnique({ where: { id } });
};

export const createUser = async (data: {
  email: string;
  password: string;
  name: string;
  role?: 'ADMIN' | 'MEMBER';
}): Promise<User> => {
  return prisma.user.create({ data });
};

// Returns all users with role=MEMBER.
// Called internally by task-service via GET /users (not exposed through gateway directly).
export const findAllMembers = async (): Promise<User[]> => {
  return prisma.user.findMany({
    where: { role: 'MEMBER' },
    orderBy: { name: 'asc' },
  });
};
