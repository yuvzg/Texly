import crypto from 'node:crypto';
import type {
  StorageService,
  PresignPutOptions,
  PresignGetOptions,
  StorageHeadResult,
} from './storage.interface.js';

interface StoredObject {
  data: Buffer;
  contentType: string;
  etag: string;
  lastModified: Date;
}

export class MemoryStorageService implements StorageService {
  public readonly bucket: string;
  private readonly objects = new Map<string, StoredObject>();

  constructor(bucket = 'texly-test-bucket') {
    this.bucket = bucket;
  }

  public readonly buildKey = {
    asset(ws: string, project: string, asset: string): string {
      return `ws/${ws}/p/${project}/assets/${asset}/original`;
    },
    compilation(ws: string, project: string, cid: string, name: string): string {
      return `ws/${ws}/p/${project}/compilations/${cid}/${name}`;
    },
  };

  public async presignPut(
    key: string,
    options: PresignPutOptions = {},
  ): Promise<{ url: string; headers?: Record<string, string> }> {
    const url = `http://storage.local/${this.bucket}/${key}?sign=put&exp=${Date.now() + (options.ttlSeconds ?? 600) * 1000}`;
    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    return { url, headers };
  }

  public async presignGet(key: string, options: PresignGetOptions = {}): Promise<string> {
    const params = new URLSearchParams();
    params.set('sign', 'get');
    params.set('exp', String(Date.now() + (options.ttlSeconds ?? 300) * 1000));
    if (options.downloadName) {
      params.set('download', options.downloadName);
    }
    if (options.inline) {
      params.set('inline', 'true');
    }
    return `http://storage.local/${this.bucket}/${key}?${params.toString()}`;
  }

  public async head(key: string): Promise<StorageHeadResult | null> {
    const obj = this.objects.get(key);
    if (!obj) {
      return null;
    }
    return {
      sizeBytes: obj.data.length,
      etag: obj.etag,
      contentType: obj.contentType,
      lastModified: obj.lastModified,
    };
  }

  public async getObject(key: string): Promise<Buffer> {
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`NoSuchKey: ${key}`);
    }
    return Buffer.from(obj.data);
  }

  public async getRange(key: string, from = 0, to?: number): Promise<Buffer> {
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`NoSuchKey: ${key}`);
    }
    const end = to !== undefined ? to + 1 : obj.data.length;
    return obj.data.subarray(from, end);
  }

  public async putObject(
    key: string,
    data: Buffer | Uint8Array | string,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    this.objects.set(key, {
      data: buffer,
      contentType,
      etag: hash,
      lastModified: new Date(),
    });
  }

  public async copy(srcKey: string, dstKey: string): Promise<void> {
    const obj = this.objects.get(srcKey);
    if (!obj) {
      throw new Error(`NoSuchKey: ${srcKey}`);
    }
    this.objects.set(dstKey, {
      data: Buffer.from(obj.data),
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: new Date(),
    });
  }

  public async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  public async listPrefix(
    prefix: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ keys: string[]; next?: string }> {
    const allKeys = Array.from(this.objects.keys()).filter((k) => k.startsWith(prefix));
    allKeys.sort();

    const limit = options?.limit ?? 1000;
    const startIndex = options?.cursor ? allKeys.indexOf(options.cursor) + 1 : 0;
    const pageKeys = allKeys.slice(startIndex, startIndex + limit);
    const next = startIndex + limit < allKeys.length ? pageKeys[pageKeys.length - 1] : undefined;

    return {
      keys: pageKeys,
      ...(next !== undefined ? { next } : {}),
    };
  }

  public clear(): void {
    this.objects.clear();
  }
}
