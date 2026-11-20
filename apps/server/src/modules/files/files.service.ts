import type { ProjectFileDTO, FileListResponseData } from '@texly/shared';
import { ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import type { FilesRepository, UpdateFileResult } from './files.repository.js';
import type { RealtimeEmitter } from '../../realtime/realtime-emitter.js';
import { getMimeTypeForTextFile } from './path-validator.js';

export class FilesService {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly realtimeEmitter?: RealtimeEmitter | undefined,
  ) {}

  public async listFiles(projectId: string, userId: string): Promise<FileListResponseData> {
    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    return this.filesRepository.listFiles(projectId);
  }

  public async getFile(
    projectId: string,
    fileId: string,
    userId: string,
  ): Promise<ProjectFileDTO> {
    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    const file = await this.filesRepository.findFileById(projectId, fileId);
    if (!file) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'File not found.');
    }

    return file;
  }

  public async createFolder(params: {
    projectId: string;
    parentId: string | null;
    name: string;
    userId: string;
  }): Promise<ProjectFileDTO> {
    const { projectId, parentId, name, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can create folders.',
      );
    }

    const folder = await this.filesRepository.createFolder({
      projectId,
      parentId,
      name,
      userId,
    });

    if (this.realtimeEmitter) {
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op: 'create',
        fileId: folder.id,
        path: folder.path,
        timestamp: new Date().toISOString(),
      });
    }

    return folder;
  }

  public async createTextFile(params: {
    projectId: string;
    parentId: string | null;
    name: string;
    content?: string | undefined;
    userId: string;
  }): Promise<ProjectFileDTO & { documentId: string }> {
    const { projectId, parentId, name, content, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can create files.',
      );
    }

    const mimeType = getMimeTypeForTextFile(name);

    const file = await this.filesRepository.createTextFile({
      projectId,
      parentId,
      name,
      mimeType,
      content,
      userId,
    });

    if (this.realtimeEmitter) {
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op: 'create',
        fileId: file.id,
        path: file.path,
        timestamp: new Date().toISOString(),
      });
    }

    return file;
  }

  public async updateFile(params: {
    projectId: string;
    fileId: string;
    name?: string | undefined;
    parentId?: string | null | undefined;
    userId: string;
  }): Promise<UpdateFileResult> {
    const { projectId, fileId, name, parentId, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can modify files.',
      );
    }

    const result = await this.filesRepository.updateFile({
      projectId,
      fileId,
      name,
      parentId,
      userId,
    });

    if (this.realtimeEmitter) {
      const op = parentId !== undefined ? 'move' : 'rename';
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op,
        fileId: result.file.id,
        path: result.file.path,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  public async deleteFile(params: {
    projectId: string;
    fileId: string;
    userId: string;
  }): Promise<{ mainFileCleared: boolean }> {
    const { projectId, fileId, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can delete files.',
      );
    }

    const result = await this.filesRepository.deleteFile({ projectId, fileId });

    if (this.realtimeEmitter) {
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op: 'delete',
        fileId,
        timestamp: new Date().toISOString(),
      });
    }

    return { mainFileCleared: result.mainFileCleared };
  }

  public async restoreFile(params: {
    projectId: string;
    fileId: string;
    userId: string;
  }): Promise<ProjectFileDTO> {
    const { projectId, fileId, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can restore files.',
      );
    }

    const restored = await this.filesRepository.restoreFile({ projectId, fileId });

    if (this.realtimeEmitter) {
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op: 'create',
        fileId: restored.id,
        path: restored.path,
        timestamp: new Date().toISOString(),
      });
    }

    return restored;
  }

  public async setMainFile(params: {
    projectId: string;
    fileId: string;
    userId: string;
  }): Promise<void> {
    const { projectId, fileId, userId } = params;

    const access = await this.filesRepository.getProjectAccess(projectId, userId);
    if (!access.hasAccess) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    if (!access.isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project editors and owners can change the main document.',
      );
    }

    await this.filesRepository.setMainFile(projectId, fileId);

    if (this.realtimeEmitter) {
      void this.realtimeEmitter.emitFileTreeChanged({
        projectId,
        op: 'rename',
        fileId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

