import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { DockerManager } from '../container/docker-manager.js';
import { WorkDirManager } from '../workdir/workdir-manager.js';
import { AssetCache } from '../cache/asset-cache.js';
import { HealthMonitor } from '../health/health-monitor.js';
import { Reaper } from '../cleanup/reaper.js';
import { ResultPublisher } from '../queue/publisher.js';
import { createCompileWorker } from '../queue/consumer.js';

export async function startCompileRunner() {
  logger.info({ env: env.NODE_ENV }, 'Starting Texly compilation runner');

  const redisConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const dockerManager = new DockerManager({
    socketPath: env.DOCKER_SOCKET_PATH,
    image: env.COMPILE_IMAGE,
    texmfCnfPath: env.TEXMF_CNF_PATH,
  });

  const workDirManager = new WorkDirManager(env.JOBS_ROOT_DIR);
  const assetCache = new AssetCache({ cacheDir: env.CACHE_ROOT_DIR });
  await assetCache.init();

  const healthMonitor = new HealthMonitor(
    dockerManager,
    env.JOBS_ROOT_DIR,
    env.MIN_DISK_FREE_PERCENT,
  );

  const publisher = new ResultPublisher(redisConnection);

  const reaper = new Reaper({
    docker: dockerManager.getDockerClient(),
    jobsRootDir: env.JOBS_ROOT_DIR,
  });

  // Startup crash recovery: sweep leftover containers and stale directories
  logger.info('Performing startup crash recovery sweep');
  const recovery = await reaper.sweep(true);
  logger.info(recovery, 'Startup recovery sweep complete');

  // Start periodic reaper
  reaper.start();

  // Create BullMQ queue consumer
  const worker = createCompileWorker({
    redisConnection,
    dockerManager,
    workDirManager,
    assetCache,
    healthMonitor,
    publisher,
    concurrency: env.COMPILE_CONCURRENCY,
  });

  worker.on('ready', () => {
    logger.info('Compile runner BullMQ worker is ready and waiting for jobs');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'BullMQ worker error');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Compile job failed');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Stopping compile runner gracefully');
    reaper.stop();
    await worker.close();
    await publisher.close();
    await redisConnection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env['NODE_ENV'] !== 'test') {
  startCompileRunner().catch((err) => {
    logger.fatal({ err }, 'Fatal error starting compile runner');
    process.exit(1);
  });
}
