import { z } from 'zod';
import { FileIdSchema, DocumentIdSchema, AssetIdSchema, ProjectIdSchema } from '../../ids/index.js';
import { NodeTypeSchema, FileKindSchema } from '../../enums/files.js';

export const ProjectFileDTOSchema = z
  .object({
    id: FileIdSchema,
    parentId: FileIdSchema.nullable(),
    name: z.string().min(1).max(255),
    path: z.string().min(1).max(1024),
    nodeType: NodeTypeSchema,
    kind: FileKindSchema.nullable(),
    sizeBytes: z.number().int().nonnegative(),
    mimeType: z.string().nullable().optional(),
    documentId: DocumentIdSchema.optional(),
    assetId: AssetIdSchema.optional(),
    revision: z.number().int().nonnegative().optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProjectFileDTO = z.infer<typeof ProjectFileDTOSchema>;

export const CreateFileRequestSchema = z
  .object({
    nodeType: NodeTypeSchema,
    parentId: FileIdSchema.nullable().default(null),
    name: z.string().min(1).max(255).trim(),
    content: z
      .string()
      .max(2 * 1024 * 1024, { message: 'Initial content must be <= 2MB' })
      .optional(),
  })
  .strict();
export type CreateFileRequest = z.infer<typeof CreateFileRequestSchema>;

export const UpdateFileRequestSchema = z
  .object({
    name: z.string().min(1).max(255).trim().optional(),
    parentId: FileIdSchema.nullable().optional(),
  })
  .strict();
export type UpdateFileRequest = z.infer<typeof UpdateFileRequestSchema>;

export const UploadAssetInitRequestSchema = z
  .object({
    name: z.string().min(1).max(255).trim(),
    sizeBytes: z.number().int().positive(),
    declaredType: z.string().min(1).max(100),
    parentId: FileIdSchema.nullable().default(null),
  })
  .strict();
export type UploadAssetInitRequest = z.infer<typeof UploadAssetInitRequestSchema>;

export const PresignedUploadDTOSchema = z
  .object({
    method: z.literal('PUT'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type PresignedUploadDTO = z.infer<typeof PresignedUploadDTOSchema>;

export const UploadAssetInitResponseDataSchema = z
  .object({
    assetId: AssetIdSchema,
    fileId: FileIdSchema,
    upload: PresignedUploadDTOSchema,
  })
  .strict();
export type UploadAssetInitResponseData = z.infer<typeof UploadAssetInitResponseDataSchema>;

export const CompleteAssetUploadRequestSchema = z
  .object({
    sha256: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/)
      .optional(),
  })
  .strict();
export type CompleteAssetUploadRequest = z.infer<typeof CompleteAssetUploadRequestSchema>;

export const UploadedAssetDTOSchema = z
  .object({
    id: AssetIdSchema,
    projectId: ProjectIdSchema,
    key: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    mimeType: z.string(),
    sha256: z.string(),
    status: z.enum(['PENDING', 'READY', 'FAILED']),
    createdAt: z.string().datetime(),
  })
  .strict();
export type UploadedAssetDTO = z.infer<typeof UploadedAssetDTOSchema>;

export const FileListResponseDataSchema = z
  .object({
    files: z.array(ProjectFileDTOSchema),
    mainFileId: FileIdSchema.nullable().optional(),
  })
  .strict();
export type FileListResponseData = z.infer<typeof FileListResponseDataSchema>;
