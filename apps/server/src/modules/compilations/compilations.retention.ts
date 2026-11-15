import type { PrismaClient } from '@texly/db';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';
import { logger } from '../../logging/logger.js';

export interface RetentionPolicyOptions {
  freeKeepCount?: number | undefined;
  proKeepCount?: number | undefined;
  freeRetentionDays?: number | undefined;
  proRetentionDays?: number | undefined;
}

export class CompilationsRetention {
  private readonly freeKeepCount: number;
  private readonly proKeepCount: number;
  private readonly freeRetentionDays: number;
  private readonly proRetentionDays: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageService: StorageService,
    options: RetentionPolicyOptions = {},
  ) {
    this.freeKeepCount = options.freeKeepCount ?? 20;
    this.proKeepCount = options.proKeepCount ?? 50;
    this.freeRetentionDays = options.freeRetentionDays ?? 7;
    this.proRetentionDays = options.proRetentionDays ?? 30;
  }

  public async runRetentionPrune(): Promise<{ prunedCount: number; artifactsDeleted: number }> {
    let prunedCount = 0;
    let artifactsDeleted = 0;

    // Get all projects with compilations
    const projects = await this.prisma.project.findMany({
      include: {
        workspace: {
          include: {
            subscription: true,
          },
        },
      },
    });

    for (const project of projects) {
      const isPro =
        project.workspace.subscription?.status === 'ACTIVE' &&
        project.workspace.subscription?.plan === 'PRO';
      const keepCount = isPro ? this.proKeepCount : this.freeKeepCount;
      const retentionDays = isPro ? this.proRetentionDays : this.freeRetentionDays;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Find compilations for project ordered by queuedAt desc
      const compilations = await this.prisma.compilation.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          queuedAt: true,
          pdfKey: true,
          synctexKey: true,
          logKey: true,
          inputsKey: true,
        },
        orderBy: { queuedAt: 'desc' },
      });

      // Those beyond keepCount or older than cutoffDate
      const toPrune = compilations.filter((c, idx) => idx >= keepCount || c.queuedAt < cutoffDate);

      for (const comp of toPrune) {
        // Delete artifacts from storage if present
        const keysToDelete = [comp.pdfKey, comp.synctexKey, comp.logKey, comp.inputsKey].filter(
          (k): k is string => Boolean(k),
        );

        for (const key of keysToDelete) {
          try {
            await this.storageService.delete(key);
            artifactsDeleted++;
          } catch (err) {
            logger.warn(
              { err, key },
              'Failed to delete compilation artifact during retention prune',
            );
          }
        }

        // Delete compilation logs and record
        await this.prisma.compilation.delete({
          where: { id: comp.id },
        });
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      logger.info({ prunedCount, artifactsDeleted }, 'Completed compilation retention prune');
    }

    return { prunedCount, artifactsDeleted };
  }
}
