import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'DOWNLOAD_FAILED',
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export interface DownloadResult {
  filePath: string;
  bytesReceived: number;
  sha256: string;
}

export async function downloadStreamToDisk(
  url: string,
  destPath: string,
  expectedSha256: string,
  expectedSizeBytes: number,
  timeoutMs: number = 30000,
): Promise<DownloadResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DownloadError(
        `HTTP download failed with status ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
      );
    }

    if (!response.body) {
      throw new DownloadError('Response body is empty', 'EMPTY_BODY');
    }

    const hash = crypto.createHash('sha256');
    let totalBytes = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        totalBytes += chunk.length;
        if (totalBytes > expectedSizeBytes) {
          callback(
            new DownloadError(
              `Downloaded bytes (${totalBytes}) exceeded expected size (${expectedSizeBytes})`,
              'SIZE_EXCEEDED',
            ),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    const fileStream = fs.createWriteStream(destPath);
    // Node.js fetch response body is a web ReadableStream
    const readable = response.body as unknown as NodeJS.ReadableStream;

    await pipeline(readable, meter, fileStream);

    if (totalBytes !== expectedSizeBytes) {
      throw new DownloadError(
        `Downloaded byte size (${totalBytes}) does not match expected size (${expectedSizeBytes})`,
        'SIZE_MISMATCH',
      );
    }

    const actualSha256 = hash.digest('hex');
    if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new DownloadError(
        `Checksum verification failed: expected ${expectedSha256}, got ${actualSha256}`,
        'CHECKSUM_MISMATCH',
      );
    }

    return {
      filePath: destPath,
      bytesReceived: totalBytes,
      sha256: actualSha256,
    };
  } catch (err: unknown) {
    // Clean up partial file on failure
    try {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
    } catch {
      // Ignore cleanup error
    }

    if (err instanceof DownloadError) {
      throw err;
    }
    if ((err as { name?: string }).name === 'AbortError') {
      throw new DownloadError(`Download timed out after ${timeoutMs}ms`, 'TIMEOUT');
    }
    throw new DownloadError(
      `Download failed: ${(err as Error).message || String(err)}`,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
