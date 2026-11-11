import { z } from 'zod';

// UUID standard regex (v4 or v7)
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Strict UUIDv7 regex (version 7 in byte 6, variant 10xx in byte 8)
export const UUIDV7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UuidSchema = z.string().regex(UUID_REGEX, { message: 'Must be a valid UUID' });

export const UuidV7Schema = z.string().regex(UUIDV7_REGEX, { message: 'Must be a valid UUIDv7' });

export const UserIdSchema = UuidSchema;
export const ProjectIdSchema = UuidSchema;
export const WorkspaceIdSchema = UuidSchema;
export const FileIdSchema = UuidSchema;
export const DocumentIdSchema = UuidSchema;
export const AssetIdSchema = UuidSchema;
export const CompilationIdSchema = UuidSchema;
export const ConversationIdSchema = UuidSchema;
export const MessageIdSchema = UuidSchema;
export const ProposalIdSchema = UuidSchema;
export const VersionIdSchema = UuidSchema;
export const SessionIdSchema = UuidSchema;
export const InviteIdSchema = UuidSchema;

export type UserId = z.infer<typeof UserIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;
export type FileId = z.infer<typeof FileIdSchema>;
export type DocumentId = z.infer<typeof DocumentIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type CompilationId = z.infer<typeof CompilationIdSchema>;
export type ConversationId = z.infer<typeof ConversationIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;
export type ProposalId = z.infer<typeof ProposalIdSchema>;
export type VersionId = z.infer<typeof VersionIdSchema>;
