import zlib from 'node:zlib';
import tar from 'tar-stream';

export interface TextFileEntry {
  path: string;
  content: string;
}

export async function buildTextBundle(files: TextFileEntry[]): Promise<Buffer> {
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const pack = tar.pack();
  const gzip = zlib.createGzip({ level: 9 });

  const chunks: Buffer[] = [];
  gzip.on('data', (chunk: Buffer) => chunks.push(chunk));

  const completion = new Promise<Buffer>((resolve, reject) => {
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.on('error', reject);
    pack.on('error', reject);
  });

  pack.pipe(gzip);

  for (const file of sortedFiles) {
    const buffer = Buffer.from(file.content, 'utf8');
    await new Promise<void>((resolve, reject) => {
      pack.entry(
        {
          name: file.path,
          size: buffer.length,
          mode: 0o644,
          mtime: new Date(0),
          uid: 10001,
          gid: 10001,
          uname: 'texly',
          gname: 'texly',
          type: 'file',
        },
        buffer,
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  pack.finalize();
  return completion;
}
