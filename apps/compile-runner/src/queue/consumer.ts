import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import path from 'node:path';
import { COMPILE_QUEUE, type CompileJobV1, type CompilationStatus } from '@texly/shared';
import { parseLatexLog } from '@texly/latex';
import { logger } from '../logging/logger.js';
import { validateCompileJob, type JobValidationError } from '../validator/job-validator.js';
import { downloadStreamToDisk, DownloadError } from '../storage/downloader.js';
import { safeExtractTar, ExtractionError } from '../storage/extractor.js';
import type { AssetCache } from '../cache/asset-cache.js';
import type { WorkDirManager } from '../workdir/workdir-manager.js';
import type { DockerManager } from '../container/docker-manager.js';
import { collectSafeOutputs, OutputCollectionError } from '../output/collector.js';
import { uploadArtifact } from '../output/uploader.js';
import type { ResultPublisher } from './publisher.js';
import type { HealthMonitor } from '../health/health-monitor.js';

export interface CompileRunnerServices {
  redisConnection: Redis;
  dockerManager: DockerManager;
  workDirManager: WorkDirManager;
  assetCache: AssetCache;
  healthMonitor: HealthMonitor;
  publisher: ResultPublisher;
  concurrency?: number;
}

export function createCompileWorker(services: CompileRunnerServices): Worker {
  const {
    redisConnection,
    dockerManager,
    workDirManager,
    assetCache,
    healthMonitor,
    publisher,
    concurrency = 4,
  } = services;

  const worker = new Worker(
    COMPILE_QUEUE,
    async (job: Job) => {
      const startTime = Date.now();
      logger.info({ jobId: job.id, name: job.name }, 'Received compilation job');

      // 1. Schema and integrity validation
      let validatedJob: CompileJobV1;
      try {
        validatedJob = validateCompileJob(job.data);
      } catch (err) {
        const error = err as JobValidationError;
        logger.warn(
          { jobId: job.id, code: error.code, message: error.message },
          'Job validation rejected',
        );

        if (job.data?.compilationId && job.data?.projectId) {
          await publisher.publishFinished({
            compilationId: job.data.compilationId,
            projectId: job.data.projectId,
            status: 'FAILED',
            exitCode: 1,
            durationMs: Date.now() - startTime,
            errorCount: 1,
            warningCount: 0,
            diagnostics: [
              {
                ordinal: 0,
                level: 'error',
                file: job.data.mainFile || 'manifest',
                line: 0,
                message: error.message,
                kind: error.code,
              },
            ],
            errorCode: error.code,
            errorMessage: error.message,
          });
        }
        return;
      }

      const { compilationId, projectId } = validatedJob;

      // 2. Publish started status
      await publisher.publishStarted(compilationId, projectId);

      // 3. Node health check
      const health = await healthMonitor.checkHealth();
      if (!health.healthy) {
        const msg = `Runner node unhealthy: docker=${health.docker}, disk=${health.diskFreePercent}% free`;
        logger.error({ compilationId, health }, msg);
        throw new Error(msg); // Rethrow to let BullMQ retry on healthy node
      }

      // 4. Setup job workspace
      const workDirs = await workDirManager.createJobDir(compilationId);

      try {
        // 5. Download text bundle
        const bundleArchiveName = 'bundle.tar';
        const bundleArchivePath = path.join(workDirs.jobDir, bundleArchiveName);

        logger.debug({ compilationId }, 'Downloading text bundle');
        await downloadStreamToDisk(
          validatedJob.inputs.textBundle.url,
          bundleArchivePath,
          validatedJob.inputs.textBundle.sha256,
          validatedJob.inputs.textBundle.sizeBytes,
          30000,
        );

        // 6. Safe archive extraction into work/src
        logger.debug({ compilationId }, 'Extracting text bundle');
        await safeExtractTar(bundleArchivePath, workDirs.srcDir, {
          maxFiles: validatedJob.limits.maxOutputFiles,
          maxTotalBytes: validatedJob.limits.workDirMb * 1024 * 1024,
        });

        // 7. Download and populate assets
        for (const asset of validatedJob.inputs.assets) {
          const destAssetPath = path.join(workDirs.srcDir, asset.path);
          await assetCache.getOrDownload(
            asset.url,
            asset.sha256,
            asset.sizeBytes,
            destAssetPath,
            30000,
          );
        }

        // 8. Execute LaTeX in hardened Docker container
        logger.info(
          { compilationId, engine: validatedJob.engine, bibTool: validatedJob.bibTool },
          'Executing LaTeX container',
        );

        const containerResult = await dockerManager.runCompileContainer(validatedJob, workDirs);

        logger.info(
          {
            compilationId,
            exitCode: containerResult.exitCode,
            timedOut: containerResult.timedOut,
            oomKilled: containerResult.oomKilled,
            durationMs: containerResult.durationMs,
          },
          'Container execution finished',
        );

        // 9. Collect outputs safely
        const outputs = await collectSafeOutputs(
          workDirs,
          validatedJob.mainFile,
          validatedJob.limits,
        );

        // 10. Parse LaTeX diagnostics from log
        const logParseResult = parseLatexLog(outputs.rawLogContent, {
          mainFile: validatedJob.mainFile,
        });

        // 11. Upload artifacts via presigned PUT URLs
        let uploadedPdfBytes: number | undefined;
        let uploadedSynctexBytes: number | undefined;

        if (outputs.pdfPath && outputs.pdfSizeBytes) {
          uploadedPdfBytes = await uploadArtifact(
            outputs.pdfPath,
            validatedJob.outputs.pdf.url,
            'application/pdf',
          );
        }

        if (outputs.synctexPath && outputs.synctexSizeBytes) {
          uploadedSynctexBytes = await uploadArtifact(
            outputs.synctexPath,
            validatedJob.outputs.synctex.url,
            'application/gzip',
          );
        }

        const uploadedLogBytes = await uploadArtifact(
          outputs.logPath,
          validatedJob.outputs.log.url,
          'text/plain; charset=utf-8',
        );

        // 12. Determine compilation status per COMPILATION_ENGINE.md
        let status: CompilationStatus;
        let errorCode: string | undefined;
        let errorMessage: string | undefined;

        if (containerResult.timedOut) {
          status = 'TIMED_OUT';
          errorCode = 'COMPILE_TIMED_OUT';
          errorMessage = 'Compilation exceeded configured execution time limit';
        } else if (containerResult.oomKilled) {
          status = 'FAILED';
          errorCode = 'COMPILE_OOM';
          errorMessage = 'Compilation exceeded allocated memory limit';
        } else if (outputs.pdfPath) {
          // Both exit 0 and nonstopmode errors that produced PDF map to SUCCEEDED
          status = 'SUCCEEDED';
        } else {
          status = 'FAILED';
          errorCode = 'NO_PDF';
          errorMessage = 'No output PDF was generated';
        }

        // 13. Publish finished result
        await publisher.publishFinished({
          compilationId,
          projectId,
          status,
          exitCode: containerResult.exitCode,
          durationMs: containerResult.durationMs,
          errorCount: logParseResult.errorCount,
          warningCount: logParseResult.warningCount,
          pageCount: logParseResult.pageCount,
          diagnostics: logParseResult.diagnostics,
          outputs: {
            pdfKey: outputs.pdfPath ? path.basename(outputs.pdfPath) : undefined,
            synctexKey: outputs.synctexPath ? path.basename(outputs.synctexPath) : undefined,
            logKey: path.basename(outputs.logPath),
          },
          outputSizes: {
            pdfBytes: uploadedPdfBytes,
            synctexBytes: uploadedSynctexBytes,
            logBytes: uploadedLogBytes,
          },
          errorCode,
          errorMessage,
        });
      } catch (err: unknown) {
        const error = err as Error;
        logger.error({ err, compilationId }, 'Compilation job execution error');

        if (
          err instanceof DownloadError ||
          err instanceof ExtractionError ||
          err instanceof OutputCollectionError
        ) {
          const code = (err as { code: string }).code || 'COMPILE_ERROR';
          await publisher.publishFinished({
            compilationId,
            projectId,
            status: 'FAILED',
            exitCode: 1,
            durationMs: Date.now() - startTime,
            errorCount: 1,
            warningCount: 0,
            diagnostics: [
              {
                ordinal: 0,
                level: 'error',
                file: validatedJob.mainFile,
                line: 0,
                message: error.message,
                kind: code,
              },
            ],
            errorCode: code,
            errorMessage: error.message,
          });
          return;
        }

        // Infrastructure errors are re-thrown to trigger BullMQ retry
        throw err;
      } finally {
        await workDirManager.cleanup(workDirs.jobDir);
      }
    },
    {
      connection: redisConnection,
      concurrency,
      lockDuration: 120000,
    },
  );

  return worker;
}
