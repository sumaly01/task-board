import cron from 'node-cron';
import prisma from '../lib/prisma';
import { redisPublisher } from '../lib/redis';
import { NotificationPayload } from '../types/notification.types';

// node-cron schedule syntax: '*/5 * * * *'
//
// Five fields (left to right): minute, hour, day-of-month, month, day-of-week
// */5  = every 5th minute  (0, 5, 10, 15 ... 55)
// *    = every hour
// *    = every day of month
// *    = every month
// *    = every day of week
//
// Why node-cron instead of setInterval?
// node-cron fires at real clock times (09:00, 09:05, 09:10...).
// setInterval(fn, 5 * 60 * 1000) fires 5 minutes after the process starts.
// If the server restarts at 09:03, setInterval fires at 09:08, 09:13 — drifting
// further from the hour boundary each restart. node-cron always fires at :00/:05.
// For reminder notifications, predictable wall-clock timing matters.
export function startReminderCron(): void {
  cron.schedule('*/5 * * * *', async () => {
    console.log('[cron] checking for tasks due within 24 hours...');

    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const dueTasks = await prisma.task.findMany({
        where: {
          dueDate: { gte: now, lte: cutoff },
          reminderSent: false,
          status: { not: 'DONE' },
        },
      });

      if (dueTasks.length === 0) {
        console.log('[cron] no tasks due within 24 hours');
        return;
      }

      console.log(`[cron] found ${dueTasks.length} task(s) requiring reminder`);

      for (const task of dueTasks) {
        const dueStr = task.dueDate?.toISOString() ?? 'unknown';

        const payload: NotificationPayload = {
          userId: task.assigneeId,
          type: 'TASK_REMINDER',
          taskId: task.id,
          projectId: task.projectId,
          message: `Reminder: "${task.title}" is due at ${dueStr}`,
          task: { id: task.id, title: task.title, dueDate: task.dueDate },
        };

        await redisPublisher.publish('notifications', JSON.stringify(payload));

        // Mark so the same task is not reminded again on the next cron tick.
        await prisma.task.update({
          where: { id: task.id },
          data: { reminderSent: true },
        });

        console.log(`[cron] reminder sent for task ${task.id} → user ${task.assigneeId}`);
      }
    } catch (err) {
      console.error('[cron] error in reminder job:', err);
    }
  });

  console.log('[cron] due-date reminder job scheduled (*/5 * * * *)');
}
