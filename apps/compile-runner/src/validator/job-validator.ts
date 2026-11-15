import { CompileJobV1Schema, type CompileJobV1 } from '@texly/shared';
import path from 'node:path';

export class JobValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'INVALID_JOB_PAYLOAD',
  ) {
    super(message);
    this.name = 'JobValidationError';
  }
}

export function validateCompileJob(rawJobData: unknown): CompileJobV1 {
  const parseResult = CompileJobV1Schema.safeParse(rawJobData);
  if (!parseResult.success) {
    const details = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new JobValidationError(`Compile job schema validation failed: ${details}`);
  }

  const job = parseResult.data;

  // 1. Expiration check
  const expiresAtMs = new Date(job.expiresAt).getTime();
  if (isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new JobValidationError(`Job has expired at ${job.expiresAt}`, 'JOB_EXPIRED');
  }

  // 2. Main file validation
  const mainFile = job.mainFile.trim();
  if (
    path.isAbsolute(mainFile) ||
    mainFile.includes('..') ||
    mainFile.includes('\0') ||
    mainFile.startsWith('/') ||
    mainFile.startsWith('\\')
  ) {
    throw new JobValidationError(
      `Invalid main file path: '${mainFile}'. Absolute paths and '..' are prohibited.`,
      'INVALID_MAIN_FILE',
    );
  }

  if (!mainFile.endsWith('.tex')) {
    throw new JobValidationError(
      `Main file must have a .tex extension, received: '${mainFile}'`,
      'INVALID_MAIN_FILE_EXTENSION',
    );
  }

  // 3. Work directory and size limits
  const maxWorkDirBytes = job.limits.workDirMb * 1024 * 1024;
  if (job.inputs.textBundle.sizeBytes > maxWorkDirBytes) {
    throw new JobValidationError(
      `Text bundle declared size (${job.inputs.textBundle.sizeBytes} bytes) exceeds limit of ${maxWorkDirBytes} bytes`,
      'PAYLOAD_TOO_LARGE',
    );
  }

  // 4. Asset paths and collision validation
  const seenPaths = new Set<string>();
  let totalAssetBytes = 0;

  for (const asset of job.inputs.assets) {
    const rawPath = asset.path.trim();
    if (
      path.isAbsolute(rawPath) ||
      rawPath.includes('..') ||
      rawPath.includes('\0') ||
      rawPath.startsWith('/') ||
      rawPath.startsWith('\\')
    ) {
      throw new JobValidationError(
        `Invalid asset path: '${rawPath}'. Absolute paths and '..' are prohibited.`,
        'INVALID_ASSET_PATH',
      );
    }

    const normalized = path.normalize(rawPath).toLowerCase();
    if (seenPaths.has(normalized)) {
      throw new JobValidationError(
        `Duplicate or case-insensitive conflicting asset path: '${rawPath}'`,
        'DUPLICATE_ASSET_PATH',
      );
    }
    seenPaths.add(normalized);

    totalAssetBytes += asset.sizeBytes;
  }

  if (job.inputs.textBundle.sizeBytes + totalAssetBytes > maxWorkDirBytes) {
    throw new JobValidationError(
      `Total input sizes (${job.inputs.textBundle.sizeBytes + totalAssetBytes} bytes) exceed working directory limit of ${maxWorkDirBytes} bytes`,
      'PAYLOAD_TOO_LARGE',
    );
  }

  return job;
}
