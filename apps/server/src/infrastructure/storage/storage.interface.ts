export interface PresignPutOptions {
  contentType?: string | undefined;
  maxBytes?: number | undefined;
  ttlSeconds?: number | undefined;
  checksumSha256?: string | undefined;
}

export interface PresignGetOptions {
  ttlSeconds?: number | undefined;
  downloadName?: string | undefined;
  contentType?: string | undefined;
  inline?: boolean | undefined;
}

export interface StorageHeadResult {
  sizeBytes: number;
  etag?: string | undefined;
  contentType?: string | undefined;
  lastModified?: Date | undefined;
}

export interface StorageService {
  readonly bucket: string;
  buildKey: {
    asset(ws: string, project: string, asset: string): string;
    compilation(ws: string, project: string, cid: string, name: string): string;
  };
  presignPut(
    key: string,
    options?: PresignPutOptions,
  ): Promise<{ url: string; headers?: Record<string, string> }>;
  presignGet(key: string, options?: PresignGetOptions): Promise<string>;
  head(key: string): Promise<StorageHeadResult | null>;
  getRange(key: string, from?: number, to?: number): Promise<Buffer>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, data: Buffer | Uint8Array | string, contentType?: string): Promise<void>;
  copy(srcKey: string, dstKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  listPrefix(
    prefix: string,
    options?: { limit?: number | undefined; cursor?: string | undefined },
  ): Promise<{ keys: string[]; next?: string | undefined }>;
}
