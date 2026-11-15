import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { downloadStreamToDisk } from '../storage/downloader.js';

export interface AssetCacheOptions {
  cacheDir: string;
  maxCacheBytes?: number;
}

const DEFAULT_MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export class AssetCache {
  private cacheDir: string;
  private maxCacheBytes: number;

  constructor(options: AssetCacheOptions) {
    this.cacheDir = path.resolve(options.cacheDir);
    this.maxCacheBytes = options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  getCachePath(sha256: string): string {
    const sanitizedHash = sha256.toLowerCase().replace(/[^a-f0-9]/g, '');
    return path.join(this.cacheDir, sanitizedHash);
  }

  async has(sha256: string): Promise<boolean> {
    const cachePath = this.getCachePath(sha256);
    try {
      const stat = await fs.promises.stat(cachePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async getOrDownload(
    url: string,
    sha256: string,
    sizeBytes: number,
    destPath: string,
    timeoutMs: number = 30000,
  ): Promise<void> {
    await this.init();
    const cachePath = this.getCachePath(sha256);

    // Ensure destination parent dir exists
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    let cacheHit = false;
    if (await this.has(sha256)) {
      // Touch cache file for LRU update
      try {
        const now = new Date();
        await fs.promises.utimes(cachePath, now, now);
        cacheHit = true;
      } catch {
        cacheHit = false;
      }
    }

    if (!cacheHit) {
      // Download directly into a temporary file in cache directory
      const tmpName = `.tmp-${crypto.randomUUID()}`;
      const tmpPath = path.join(this.cacheDir, tmpName);

      await downloadStreamToDisk(url, tmpPath, sha256, sizeBytes, timeoutMs);
      await fs.promises.rename(tmpPath, cachePath);

      // Trigger asynchronous cache prune check
      this.pruneIfNeeded().catch(() => {});
    }

    // Copy to destination (never symlink!)
    // Attempt hard link first for speed; fall back to copy if cross-device
    try {
      if (fs.existsSync(destPath)) {
        await fs.promises.unlink(destPath);
      }
      await fs.promises.link(cachePath, destPath);
    } catch {
      await fs.promises.copyFile(cachePath, destPath);
    }
  }

  async pruneIfNeeded(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const entries: { file: string; path: string; size: number; mtime: number }[] = [];
      let totalSize = 0;

      for (const file of files) {
        if (file.startsWith('.')) continue;
        const filePath = path.join(this.cacheDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            entries.push({
              file,
              path: filePath,
              size: stat.size,
              mtime: stat.mtimeMs,
            });
            totalSize += stat.size;
          }
        } catch {
          // Ignore
        }
      }

      if (totalSize <= this.maxCacheBytes) {
        return;
      }

      // Sort oldest first (LRU)
      entries.sort((a, b) => a.mtime - b.mtime);

      for (const entry of entries) {
        try {
          await fs.promises.unlink(entry.path);
          totalSize -= entry.size;
          if (totalSize <= this.maxCacheBytes * 0.8) {
            break;
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore prune errors
    }
  }
}
