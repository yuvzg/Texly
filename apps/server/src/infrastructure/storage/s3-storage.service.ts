import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageService,
  PresignPutOptions,
  PresignGetOptions,
  StorageHeadResult,
} from './storage.interface.js';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
}

export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  public readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
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
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
    });

    const ttl = options.ttlSeconds ?? 600; // 10 minutes default
    const url = await getSignedUrl(this.client, command, { expiresIn: ttl });
    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    return { url, headers };
  }

  public async presignGet(key: string, options: PresignGetOptions = {}): Promise<string> {
    const ttl = options.ttlSeconds ?? 300; // 5 minutes default
    let contentDisposition: string | undefined;

    if (options.downloadName) {
      // Escape quotes in filename
      const safeName = options.downloadName.replace(/"/g, '\\"');
      contentDisposition = `attachment; filename="${safeName}"`;
    } else if (options.inline) {
      contentDisposition = 'inline';
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: contentDisposition,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  public async head(key: string): Promise<StorageHeadResult | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        sizeBytes: Number(response.ContentLength ?? 0),
        etag: response.ETag?.replace(/"/g, ''),
        contentType: response.ContentType,
        lastModified: response.LastModified,
      };
    } catch (err: unknown) {
      const code =
        (err as { name?: string; code?: string })?.name ?? (err as { code?: string })?.code;
      if (
        code === 'NotFound' ||
        code === 'NoSuchKey' ||
        (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  public async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      return Buffer.alloc(0);
    }
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  public async getRange(key: string, from?: number, to?: number): Promise<Buffer> {
    const rangeHeader =
      from !== undefined || to !== undefined ? `bytes=${from ?? 0}-${to ?? ''}` : undefined;
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: rangeHeader,
      }),
    );

    if (!response.Body) {
      return Buffer.alloc(0);
    }
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  public async putObject(
    key: string,
    data: Buffer | Uint8Array | string,
    contentType?: string,
  ): Promise<void> {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType ?? 'application/octet-stream',
      }),
    );
  }

  public async copy(srcKey: string, dstKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${srcKey}`,
        Key: dstKey,
      }),
    );
  }

  public async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err: unknown) {
      const code =
        (err as { name?: string; code?: string })?.name ?? (err as { code?: string })?.code;
      if (
        code === 'NotFound' ||
        code === 'NoSuchKey' ||
        (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404
      ) {
        return;
      }
      throw err;
    }
  }

  public async listPrefix(
    prefix: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ keys: string[]; next?: string }> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: options?.limit ?? 1000,
        ContinuationToken: options?.cursor,
      }),
    );

    const keys = (response.Contents ?? []).map((c) => c.Key!).filter(Boolean);
    return {
      keys,
      ...(response.NextContinuationToken ? { next: response.NextContinuationToken } : {}),
    };
  }
}
