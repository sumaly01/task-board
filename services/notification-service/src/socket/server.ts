import { Server } from 'socket.io';
import http from 'http';
import { redisSubscriber } from '../lib/redis';
import { NotificationPayload } from '../types/notification.types';

// In-process registry: userId → socketId.
//
// Each instance of notification-service maintains its own map. When a Redis
// notification arrives, we look up the socketId here. If the user is connected
// to THIS instance, we deliver. If not, the delivery is a no-op — the correct
// instance (which does have the socket) will handle it from the same Redis
// message via its own subscriber.
const userSocketMap = new Map<string, string>();

export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Subscribe to the shared notifications channel once at startup.
  // All instances share this subscription — Redis fan-outs the message to every
  // subscriber. Each instance then checks its own userSocketMap to decide
  // whether it can deliver.
  redisSubscriber.subscribe('notifications', (err) => {
    if (err) console.error('[redis-sub] failed to subscribe', err);
    else console.log('[redis-sub] subscribed to notifications channel');
  });

  redisSubscriber.on('message', (_channel, message) => {
    const payload = JSON.parse(message) as NotificationPayload;
    const socketId = userSocketMap.get(payload.userId);

    if (socketId) {
      io.to(socketId).emit('notification', payload);
      console.log(`[socket] → user ${payload.userId} (${payload.type})`);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    // Client emits 'register' with their userId immediately after connecting.
    // The frontend (Day 5) sends this after decoding the JWT from the cookie.
    socket.on('register', (userId: string) => {
      userSocketMap.set(userId, socket.id);
      console.log(`[socket] registered user ${userId} → ${socket.id}`);
      socket.emit('registered', { userId });
    });

    socket.on('disconnect', () => {
      for (const [userId, id] of userSocketMap.entries()) {
        if (id === socket.id) {
          userSocketMap.delete(userId);
          console.log(`[socket] unregistered user ${userId}`);
          break;
        }
      }
    });
  });

  return io;
}
