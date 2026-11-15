import fs from 'node:fs';

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UPLOAD_FAILED',
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadOptions {
  timeoutMs?: number;
}

export async function uploadArtifact(
  filePath: string,
  presignedPutUrl: string,
  contentType: string,
  options: UploadOptions = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    const fileStream = fs.createReadStream(filePath);
    // In Node.js native fetch, duplex: 'half' is required when streaming a request body
    const fetchOptions: RequestInit & { duplex?: string } = {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
      },
      body: fileStream as unknown as ReadableStream,
      duplex: 'half',
      signal: controller.signal,
    };

    const response = await fetch(presignedPutUrl, fetchOptions);

    if (!response.ok) {
      throw new UploadError(
        `Artifact upload failed with HTTP status ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
      );
    }

    return fileSize;
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      throw err;
    }
    if ((err as { name?: string }).name === 'AbortError') {
      throw new UploadError(`Upload timed out after ${timeoutMs}ms`, 'TIMEOUT');
    }
    throw new UploadError(
      `Artifact upload failed: ${(err as Error).message || String(err)}`,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
