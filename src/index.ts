import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import amqplib from 'amqplib';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const PORT = Number(process.env.PORT || 3000);

async function createRabbitChannel() {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange('bookings', 'fanout', { durable: true });
  return ch;
}

const server = Fastify({ logger: true });

interface BookingRequest {
  event_id: number;
  user_id: string;
}

server.post('/api/bookings/reserve', async (request, reply) => {
  const body = request.body as BookingRequest;
  const eventId = Number(body?.event_id);
  const userId = String(body?.user_id || '');

  if (!eventId || !userId) {
    return reply.status(400).send({ error: 'event_id and user_id required' });
  }

  const lockKey = `lock:event:${eventId}`;
  const lockVal = `${Date.now()}_${Math.random()}`;
  const lockTtl = 5000; // ms

 
  const acquired = await redis.set(lockKey, lockVal, 'PX', lockTtl, 'NX');
  if (!acquired) {
    return reply.status(429).send({ error: 'Too many requests, try again' });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { id: true, totalSeats: true }
      });
      if (!event) {
        return { status: 404, body: { error: 'Event not found' } };
      }

      const booked = await tx.booking.count({ where: { eventId } });
      if (booked >= event.totalSeats) {
        return { status: 400, body: { error: 'No seats available' } };
      }

      try {
        const booking = await tx.booking.create({
          data: { eventId, userId }
        });
        return { status: 201, body: { success: true, booking } };
      } catch (err: any) {
        if (err.code === 'P2002') {
          return { status: 400, body: { error: 'User already booked this event' } };
        }
        throw err;
      }
    });

    if (result.status !== 201) {
      return reply.status(result.status).send(result.body);
    }

    try {
      const channel = await createRabbitChannel();
      const payload = JSON.stringify({ event: 'booking.created', data: result.body.booking });
      channel.publish('bookings', '', Buffer.from(payload), { persistent: true });
    } catch (e: unknown) {
      server.log.error({ error: e }, 'Failed to publish to RabbitMQ');
    }

    return reply.status(201).send(result.body);

  } finally {
    try {
      const val = await redis.get(lockKey);
      if (val === lockVal) {
        await redis.del(lockKey);
      }
    } catch (e: unknown) {
      server.log.error({ error: e }, 'Error releasing lock');
    }
  }
});

const start = async () => {
  try {
    await prisma.$connect();
    server.log.info('Prisma connected');
    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`Server listening on ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();