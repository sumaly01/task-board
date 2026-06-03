import cron from 'node-cron';
import prisma from '../lib/prisma';
import { redisPublisher } from '../lib/redis';
import { NotificationPayload } from '../types/notification.types';

// Fires every 3 hours. No reminderSent flag needed — the cron interval IS the
// rate limiter. A task stays in the result set until the member marks it DONE
// or the deadline passes, so reminders keep coming every 3 hours automatically.
//
// Cron syntax: '0 */3 * * *'
// 0      = at minute 0 (top of the hour)
// */3    = every 3rd hour  (00:00, 03:00, 06:00 ... 21:00)
// * * *  = every day, every month, every day-of-week
export function startReminderCron(): void {
  cron.schedule('*/1 * * * *', async () => {
    // cron.schedule('0 */3 * * *', async () => {  -------- for 3 hours
    console.log('[cron] checking for incomplete tasks due within 24 hours...');

    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const dueTasks = await prisma.task.findMany({
        where: {
          dueDate: { gte: now, lte: cutoff },
          status: { not: 'DONE' },
        },
      });

      if (dueTasks.length === 0) {
        console.log('[cron] no incomplete tasks due within 24 hours');
        return;
      }

      console.log(`[cron] found ${dueTasks.length} task(s) — sending reminders`);

      // Resolve all unique assigneeIds to names in parallel before logging.
      const authUrl = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:4001';
      const uniqueAssigneeIds = [...new Set(dueTasks.map((t) => t.assigneeId))];
      const nameMap = new Map<string, string>();

      await Promise.all(
        uniqueAssigneeIds.map(async (id) => {
          try {
            const res = await fetch(`${authUrl}/auth/users/${id}`);
            if (res.ok) {
              const data = await res.json() as { user: { name: string } };
              nameMap.set(id, data.user.name);
            }
          } catch {
            // best-effort — falls back to raw ID if auth-service is unreachable
          }
        }),
      );

      for (const task of dueTasks) {
        const dueStr = task.dueDate?.toISOString() ?? 'unknown';
        const assigneeName = nameMap.get(task.assigneeId) ?? task.assigneeId;

        const payload: NotificationPayload = {
          userId: task.assigneeId,
          type: 'TASK_REMINDER',
          taskId: task.id,
          projectId: task.projectId,
          message: `Reminder: "${task.title}" is due at ${dueStr}`,
          task: { id: task.id, title: task.title, dueDate: task.dueDate },
        };

        await redisPublisher.publish('notifications', JSON.stringify(payload));

        console.log(`[cron] reminder sent → ${assigneeName} | task: "${task.title}" | due: ${dueStr}`);
      }
    } catch (err) {
      console.error('[cron] error in reminder job:', err);
    }
  });

  console.log('[cron] due-date reminder job scheduled (0 */3 * * * — every 3 hours)');
}
