import { Server } from 'colyseus';
import { DuelRoom } from './rooms/DuelRoom';

const port = Number(process.env.PORT ?? 2567);
const redisUrl = process.env.REDIS_URL;

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, unknown> = {};

  if (redisUrl) {
    // Redis presence + driver let multiple server nodes share the matchmaking
    // pool and room registry, so the two players of a match can land on
    // different instances. This is the path the production deployment uses.
    const { RedisPresence } = await import('@colyseus/redis-presence');
    const { RedisDriver } = await import('@colyseus/redis-driver');
    options.presence = new RedisPresence(redisUrl);
    options.driver = new RedisDriver(redisUrl);
    console.log(`[duels] Redis matchmaking enabled (${redisUrl})`);
  } else {
    console.log('[duels] REDIS_URL not set — single-node in-memory matchmaking');
  }

  const gameServer = new Server(options);
  // filterBy('mode') so players only match opponents who chose the same mode.
  gameServer.define('duel', DuelRoom).filterBy(['mode']);

  await gameServer.listen(port);
  console.log(`[duels] listening on ws://localhost:${port}`);
}

void main();
