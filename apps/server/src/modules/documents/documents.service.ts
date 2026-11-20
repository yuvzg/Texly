import { createHash } from 'node:crypto';
import type {
  DocumentDTO,
  PutDocumentContentRequest,
  PutDocumentContentResponseData,
} from '@texly/shared';
import { ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import type { DocumentsRepository } from './documents.repository.js';
import type { RealtimeEmitter } from '../../realtime/realtime-emitter.js';

export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly realtimeEmitter?: RealtimeEmitter | undefined,
  ) {}

  public async findProjectIdForDocument(documentId: string): Promise<string | null> {
    return this.documentsRepository.findProjectIdForDocument(documentId);
  }

  public async getDocument(
    projectId: string,
    documentId: string,
    userId: string,
  ): Promise<DocumentDTO> {
    const access = await this.documentsRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    const doc = await this.documentsRepository.findDocument(projectId, documentId);
    if (!doc) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Document not found.');
    }

    return {
      id: doc.id,
      fileId: doc.fileId,
      projectId: doc.projectId,
      path: doc.file.path,
      content: doc.content,
      contentHash: doc.contentHash,
      revision: doc.revision,
      sizeBytes: doc.sizeBytes,
      updatedAt: doc.updatedAt.toISOString(),
      ...(doc.updatedById ? { updatedBy: doc.updatedById } : {}),
    };
  }

  public async getMainDocument(projectId: string, userId: string): Promise<DocumentDTO> {
    const access = await this.documentsRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    const doc = await this.documentsRepository.findMainDocument(projectId);
    if (!doc) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'No main document found for project.');
    }

    return {
      id: doc.id,
      fileId: doc.fileId,
      projectId: doc.projectId,
      path: doc.file.path,
      content: doc.content,
      contentHash: doc.contentHash,
      revision: doc.revision,
      sizeBytes: doc.sizeBytes,
      updatedAt: doc.updatedAt.toISOString(),
      ...(doc.updatedById ? { updatedBy: doc.updatedById } : {}),
    };
  }

  public async saveDocumentContent(
    projectId: string,
    documentId: string,
    userId: string,
    input: PutDocumentContentRequest,
  ): Promise<PutDocumentContentResponseData> {
    const access = await this.documentsRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can edit document content.',
      );
    }

    // Normalize CRLF to LF per API specification
    const normalizedContent = input.content.replace(/\r\n/g, '\n');

    // Verify client hash if supplied
    if (input.clientHash) {
      const calculatedHash = createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
      if (input.clientHash.toLowerCase() !== calculatedHash.toLowerCase()) {
        throw new AppError(
          ErrorCodeEnum.HASH_MISMATCH,
          422,
          'Provided clientHash does not match content hash.',
        );
      }
    }

    const result = await this.documentsRepository.updateDocumentContent({
      projectId,
      documentId,
      baseRevision: input.baseRevision,
      content: normalizedContent,
      userId,
    });

    // Emit realtime event if document revision changed
    if (!result.unchanged && this.realtimeEmitter) {
      void this.realtimeEmitter.emitDocumentRevisionChanged({
        projectId,
        documentId,
        revision: result.revision,
        contentHash: result.contentHash,
        byUserId: userId,
        timestamp: result.updatedAt,
      });
    }

    return result;
  }
}
