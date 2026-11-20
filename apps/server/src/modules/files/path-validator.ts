import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export const ALLOWED_TEXT_EXTENSIONS = new Set([
  '.tex',
  '.bib',
  '.sty',
  '.cls',
  '.bst',
  '.txt',
  '.md',
  '.csv',
]);

export const ALLOWED_BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.eps',
  '.svg',
  '.ttf',
  '.otf',
]);

export const FORBIDDEN_NAME_CHARS_REGEX = /[/\\:*?"<>|\x00-\x1f\x7f]/;
export const MAX_NAME_LENGTH = 255;
export const MAX_PATH_LENGTH = 1024;
export const MAX_PATH_DEPTH = 12;
export const MAX_DOCUMENT_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Normalizes Unicode to NFC and path separators to single forward slashes.
 * Removes leading and trailing slashes.
 */
export function normalizePath(rawPath: string): string {
  const nfc = rawPath.normalize('NFC');
  const normalizedSlashes = nfc.replace(/\\/g, '/');
  const segments = normalizedSlashes
    .split('/')
    .filter((seg) => seg.length > 0);
  return segments.join('/');
}

/**
 * Validates a single directory or file name segment.
 */
export function validateFileName(name: string, nodeType: 'FILE' | 'FOLDER'): void {
  if (!name || typeof name !== 'string') {
    throw new AppError(ErrorCodeEnum.INVALID_NAME, 422, 'File or folder name cannot be empty.');
  }

  // Check leading/trailing whitespace
  if (name.trim() !== name) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      'File or folder name cannot have leading or trailing whitespace.',
    );
  }

  // Check byte and character length
  if (name.length > MAX_NAME_LENGTH || Buffer.byteLength(name, 'utf8') > MAX_NAME_LENGTH) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      `File or folder name cannot exceed ${MAX_NAME_LENGTH} characters.`,
    );
  }

  // Check forbidden characters: / \ : * ? " < > | and control chars / null bytes
  if (FORBIDDEN_NAME_CHARS_REGEX.test(name)) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      'File or folder name contains forbidden characters (\\ / : * ? " < > | or control characters).',
    );
  }

  // Cannot be . or ..
  if (name === '.' || name === '..') {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      'File or folder name cannot be "." or "..".',
    );
  }

  // Cannot start with a hyphen
  if (name.startsWith('-')) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      'File or folder name cannot start with a hyphen.',
    );
  }

  // Cannot have trailing dot
  if (name.endsWith('.')) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      'File or folder name cannot end with a period.',
    );
  }

  // Cannot start with a dot except allowlisted names like .gitkeep
  if (name.startsWith('.')) {
    if (name !== '.gitkeep') {
      throw new AppError(
        ErrorCodeEnum.INVALID_NAME,
        422,
        'File or folder name cannot start with a dot (hidden files are not permitted).',
      );
    }
  }

  // If FILE, must validate extension
  if (nodeType === 'FILE') {
    if (name === '.gitkeep') {
      return;
    }
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      throw new AppError(
        ErrorCodeEnum.UNSUPPORTED_FILE_TYPE,
        422,
        'Text file must have a valid file extension.',
      );
    }
    const ext = name.slice(lastDotIndex).toLowerCase();
    if (!ALLOWED_TEXT_EXTENSIONS.has(ext)) {
      throw new AppError(
        ErrorCodeEnum.UNSUPPORTED_FILE_TYPE,
        422,
        `Unsupported text file extension "${ext}". Allowed text extensions: ${Array.from(ALLOWED_TEXT_EXTENSIONS).join(', ')}`,
      );
    }
  }
}

/**
 * Validates a normalized materialized path.
 */
export function validateMaterializedPath(path: string): void {
  if (!path) {
    throw new AppError(ErrorCodeEnum.INVALID_NAME, 422, 'Path cannot be empty.');
  }

  if (path.length > MAX_PATH_LENGTH) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      `Materialized path exceeds maximum length of ${MAX_PATH_LENGTH} characters.`,
    );
  }

  const segments = path.split('/');
  if (segments.length > MAX_PATH_DEPTH) {
    throw new AppError(
      ErrorCodeEnum.INVALID_NAME,
      422,
      `Directory depth exceeds maximum limit of ${MAX_PATH_DEPTH} levels.`,
    );
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new AppError(
        ErrorCodeEnum.INVALID_NAME,
        422,
        'Path traversal (using "." or "..") is strictly forbidden.',
      );
    }
  }
}

/**
 * Checks whether moving a folder to targetParentPath would cause a circular tree reference.
 */
export function checkCircularMove(sourcePath: string, targetParentPath: string | null): void {
  if (!targetParentPath) {
    return;
  }

  if (targetParentPath === sourcePath || targetParentPath.startsWith(sourcePath + '/')) {
    throw new AppError(
      ErrorCodeEnum.INVALID_MOVE,
      422,
      'Cannot move a folder into itself or into one of its subdirectories.',
    );
  }
}

/**
 * Returns MIME type based on file extension.
 */
export function getMimeTypeForTextFile(name: string): string {
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return 'text/plain';
  }
  const ext = name.slice(lastDotIndex).toLowerCase();
  switch (ext) {
    case '.tex':
      return 'application/x-tex';
    case '.bib':
      return 'application/x-bibtex';
    case '.sty':
    case '.cls':
      return 'text/x-tex';
    case '.bst':
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.csv':
      return 'text/csv';
    default:
      return 'text/plain';
  }
}

