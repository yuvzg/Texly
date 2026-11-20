import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';

import {
  RegisterRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  VerifyEmailRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  AuthTokenResponseDataSchema,
  RefreshResponseDataSchema,
  AuthMeResponseDataSchema,
  UserDTOSchema,
  UserSettingsDTOSchema,
  UpdateUserRequestSchema,
  UpdateUserSettingsRequestSchema,
  WorkspaceWithRoleDTOSchema,
  ProjectDTOSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  ProjectMemberDTOSchema,
  CreateProjectInviteRequestSchema,
  ProjectInviteDTOSchema,
  AcceptInviteRequestSchema,
  FileListResponseDataSchema,
  ProjectFileDTOSchema,
  CreateFileRequestSchema,
  UpdateFileRequestSchema,
  DocumentDTOSchema,
  PutDocumentContentRequestSchema,
  PutDocumentContentResponseDataSchema,
  UploadAssetInitRequestSchema,
  UploadAssetInitResponseDataSchema,
  CompleteAssetUploadRequestSchema,
  CompilationDTOSchema,
  CreateCompilationRequestSchema,
  CompilationLogDTOSchema,
  CompilationPdfResponseDataSchema,
  LLMModelCatalogItemSchema,
  AIConversationDTOSchema,
  CreateConversationRequestSchema,
  CreateAIMessageRequestSchema,
  CreateAIMessageResponseDataSchema,
  ProposalDTOSchema,
  AcceptProposalRequestSchema,
  AcceptProposalResponseDataSchema,
  RejectProposalResponseDataSchema,
  DocumentVersionDTOSchema,
  CreateVersionRequestSchema,
  RestoreVersionRequestSchema,
  RestoreVersionResponseDataSchema,
  CompareVersionsResponseDataSchema,
} from '../schemas/index.js';

import { createSuccessEnvelopeSchema } from '../contracts/envelope.js';
import { ApiErrorEnvelopeSchema } from '../errors/schemas.js';

// Initialize OpenAPI Zod extensions
extendZodWithOpenApi(z);

export function buildOpenApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // Security Schemes
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Enter your JWT access token',
  });

  // Common Error Component
  registry.register('ApiErrorEnvelope', ApiErrorEnvelopeSchema);

  // Health
  registry.registerPath({
    method: 'get',
    path: '/healthz',
    summary: 'Liveness probe',
    responses: {
      200: {
        description: 'Service is alive',
        content: {
          'application/json': {
            schema: z.object({ status: z.literal('ok'), uptime: z.number() }).strict(),
          },
        },
      },
    },
  });

  // Auth: Register
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/register',
    summary: 'Register a new user account',
    request: {
      body: {
        content: { 'application/json': { schema: RegisterRequestSchema } },
      },
    },
    responses: {
      201: {
        description: 'User registered successfully',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(AuthTokenResponseDataSchema) },
        },
      },
      409: {
        description: 'Email already taken',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
      422: {
        description: 'Validation failed',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Auth: Login
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Authenticate user with email and password',
    request: {
      body: {
        content: { 'application/json': { schema: LoginRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'User authenticated',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(AuthTokenResponseDataSchema) },
        },
      },
      401: {
        description: 'Invalid credentials',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Auth: Refresh
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    summary: 'Rotate refresh token and retrieve new access token',
    responses: {
      200: {
        description: 'Token refreshed',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(RefreshResponseDataSchema) },
        },
      },
      401: {
        description: 'Invalid or reused refresh token',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Auth: Logout
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/logout',
    summary: 'Revoke active session and clear cookie',
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: LogoutRequestSchema } } },
    },
    responses: {
      204: {
        description: 'Session logged out and refresh cookie cleared',
      },
    },
  });

  // Users: Get current user profile
  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/me',
    summary: 'Get current authenticated user profile and workspaces',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Current user profile, workspaces, settings and subscription plan',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(AuthMeResponseDataSchema) },
        },
      },
      401: {
        description: 'Unauthenticated',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Auth: Verify Email
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/verify-email',
    summary: 'Verify user email address using verification token',
    request: {
      body: { content: { 'application/json': { schema: VerifyEmailRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Email verified successfully',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.object({ verified: z.boolean() }).strict()),
          },
        },
      },
      400: {
        description: 'Invalid or expired token',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Auth: Forgot Password
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/forgot-password',
    summary: 'Request a password reset link',
    request: {
      body: { content: { 'application/json': { schema: ForgotPasswordRequestSchema } } },
    },
    responses: {
      202: {
        description: 'Generic confirmation response to prevent enumeration',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.object({ message: z.string() }).strict()),
          },
        },
      },
    },
  });

  // Auth: Reset Password
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/reset-password',
    summary: 'Reset password using token',
    request: {
      body: { content: { 'application/json': { schema: ResetPasswordRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Password reset successfully',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.object({ message: z.string() }).strict()),
          },
        },
      },
      400: {
        description: 'Invalid or expired reset token',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Users: Update profile
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/me',
    summary: 'Update user profile details',
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: UpdateUserRequestSchema } } },
    },
    responses: {
      200: {
        description: 'User profile updated',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(UserDTOSchema) },
        },
      },
    },
  });

  // Users: Settings
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/me/settings',
    summary: 'Get user settings',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'User settings',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(UserSettingsDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/me/settings',
    summary: 'Update user settings',
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: UpdateUserSettingsRequestSchema } } },
    },
    responses: {
      200: {
        description: 'User settings updated',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(UserSettingsDTOSchema) },
        },
      },
    },
  });

  // Workspaces: List
  registry.registerPath({
    method: 'get',
    path: '/api/v1/workspaces',
    summary: 'List user workspaces',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Workspaces list',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.array(WorkspaceWithRoleDTOSchema)),
          },
        },
      },
    },
  });

  // Projects: List & Create
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects',
    summary: 'List projects accessible to user',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Projects list',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(z.array(ProjectDTOSchema)) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects',
    summary: 'Create a new LaTeX project',
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: CreateProjectRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Project created',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectDTOSchema) },
        },
      },
    },
  });

  // Projects: Get & Update & Delete
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}',
    summary: 'Get project details',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Project details',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/projects/{projectId}',
    summary: 'Update project settings',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: UpdateProjectRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Project updated',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectDTOSchema) },
        },
      },
    },
  });

  // Members & Invites
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/members',
    summary: 'List project members',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Project members',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.array(ProjectMemberDTOSchema)),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/invites',
    summary: 'Invite a member to the project',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: CreateProjectInviteRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Invite sent',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectInviteDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/invites/accept',
    summary: 'Accept an invite via token',
    security: [{ bearerAuth: [] }],
    request: {
      body: { content: { 'application/json': { schema: AcceptInviteRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Invite accepted',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(
              z.object({ projectId: z.string().uuid() }).strict(),
            ),
          },
        },
      },
    },
  });

  // Files: List & Create
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/files',
    summary: 'List project files and directory tree',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Files tree flat list',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(FileListResponseDataSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/files',
    summary: 'Create a new file or directory',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: CreateFileRequestSchema } } },
    },
    responses: {
      201: {
        description: 'File or directory created',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectFileDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/projects/{projectId}/files/{fileId}',
    summary: 'Rename or move a file or directory',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          fileId: z.string().uuid(),
        })
        .strict(),
      body: { content: { 'application/json': { schema: UpdateFileRequestSchema } } },
    },
    responses: {
      200: {
        description: 'File updated',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectFileDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/files/{fileId}',
    summary: 'Get details of a single file or directory',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          fileId: z.string().uuid(),
        })
        .strict(),
    },
    responses: {
      200: {
        description: 'File details',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectFileDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/projects/{projectId}/files/{fileId}',
    summary: 'Soft-delete a file or directory tree',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          fileId: z.string().uuid(),
        })
        .strict(),
    },
    responses: {
      204: {
        description: 'File or directory deleted successfully',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/files/{fileId}/set-main',
    summary: 'Set document as the main compilation file',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          fileId: z.string().uuid(),
        })
        .strict(),
    },
    responses: {
      200: {
        description: 'Main file set successfully',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(z.object({ success: z.boolean() })) },
        },
      },
    },
  });

  // Documents: Content Autosave
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{documentId}',
    summary: 'Get document details and content',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
        })
        .strict(),
    },
    responses: {
      200: {
        description: 'Document content',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(DocumentDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/v1/projects/{projectId}/documents/{documentId}/content',
    summary: 'Save document content with optimistic concurrency control',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
        })
        .strict(),
      body: { content: { 'application/json': { schema: PutDocumentContentRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Content saved successfully',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(PutDocumentContentResponseDataSchema),
          },
        },
      },
      409: {
        description: 'Revision conflict',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // Assets: Presigned Upload Flow
  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/assets/uploads',
    summary: 'Initialize asset upload and request presigned URL',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: UploadAssetInitRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Upload initiated',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(UploadAssetInitResponseDataSchema),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/assets/uploads/{assetId}/complete',
    summary: 'Finalize and verify uploaded asset',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          assetId: z.string().uuid(),
        })
        .strict(),
      body: { content: { 'application/json': { schema: CompleteAssetUploadRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Asset verified and ready',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProjectFileDTOSchema) },
        },
      },
    },
  });

  // Compilations
  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/compilations',
    summary: 'Trigger LaTeX compilation for project',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: CreateCompilationRequestSchema } } },
    },
    responses: {
      202: {
        description: 'Compilation queued',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(CompilationDTOSchema) },
        },
      },
      201: {
        description: 'Compilation succeeded with cache hit',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(CompilationDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/compilations/{compilationId}/log',
    summary: 'Get parsed compilation diagnostics and log',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ compilationId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Diagnostics log',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(CompilationLogDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/compilations/{compilationId}/pdf',
    summary: 'Get presigned URL for compiled PDF artifact',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ compilationId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Presigned PDF download URL',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(CompilationPdfResponseDataSchema),
          },
        },
      },
    },
  });

  // AI: Models catalog
  registry.registerPath({
    method: 'get',
    path: '/api/v1/ai/models',
    summary: 'Get enabled LLM models catalog',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Models catalog',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.array(LLMModelCatalogItemSchema)),
          },
        },
      },
    },
  });

  // AI: Conversations & Messages
  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/ai/conversations',
    summary: 'Create AI conversation thread',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ projectId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: CreateConversationRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Conversation created',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(AIConversationDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/ai/conversations/{conversationId}/messages',
    summary: 'Send prompt message to generate edit proposal',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ conversationId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: CreateAIMessageRequestSchema } } },
    },
    responses: {
      202: {
        description: 'Message queued and proposal generation started',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(CreateAIMessageResponseDataSchema),
          },
        },
      },
      409: {
        description: 'Revision conflict or proposal in progress',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  // AI: Proposal Accept / Reject
  registry.registerPath({
    method: 'get',
    path: '/api/v1/ai/proposals/{proposalId}',
    summary: 'Get proposal details and proposed content',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ proposalId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Proposal details',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(ProposalDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/ai/proposals/{proposalId}/accept',
    summary: 'Accept AI proposal and atomically commit changes to document',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ proposalId: z.string().uuid() }).strict(),
      body: { content: { 'application/json': { schema: AcceptProposalRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Proposal accepted and changes applied',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(AcceptProposalResponseDataSchema),
          },
        },
      },
      409: {
        description: 'Proposal is stale or document was modified',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/ai/proposals/{proposalId}/reject',
    summary: 'Reject AI proposal without modifying document',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ proposalId: z.string().uuid() }).strict(),
    },
    responses: {
      200: {
        description: 'Proposal rejected',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(RejectProposalResponseDataSchema),
          },
        },
      },
    },
  });

  // Versions
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{documentId}/versions',
    summary: 'List document versions',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
        })
        .strict(),
    },
    responses: {
      200: {
        description: 'Versions history',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(z.array(DocumentVersionDTOSchema)),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/documents/{documentId}/versions',
    summary: 'Create a manual snapshot version',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
        })
        .strict(),
      body: { content: { 'application/json': { schema: CreateVersionRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Version created',
        content: {
          'application/json': { schema: createSuccessEnvelopeSchema(DocumentVersionDTOSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects/{projectId}/documents/{documentId}/versions/{versionId}/restore',
    summary: 'Restore document to a previous version',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
          versionId: z.string().uuid(),
        })
        .strict(),
      body: { content: { 'application/json': { schema: RestoreVersionRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Version restored',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(RestoreVersionResponseDataSchema),
          },
        },
      },
      409: {
        description: 'Revision conflict or active proposal prevents restore',
        content: { 'application/json': { schema: ApiErrorEnvelopeSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{projectId}/documents/{documentId}/versions/compare',
    summary: 'Compare two document versions and generate diff',
    security: [{ bearerAuth: [] }],
    request: {
      params: z
        .object({
          projectId: z.string().uuid(),
          documentId: z.string().uuid(),
        })
        .strict(),
      query: z
        .object({
          from: z.string(),
          to: z.string(),
          format: z.enum(['unified', 'hunks']).default('unified'),
        })
        .strict(),
    },
    responses: {
      200: {
        description: 'Versions diff comparison',
        content: {
          'application/json': {
            schema: createSuccessEnvelopeSchema(CompareVersionsResponseDataSchema),
          },
        },
      },
    },
  });

  return registry;
}

export function generateOpenApiDocument(): OpenAPIObject {
  const registry = buildOpenApiRegistry();
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Texly API',
      version: '0.1.0',
      description:
        'Production-grade, web-based collaborative LaTeX editor with AI modification workflow.',
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Local development server',
      },
    ],
  });
}
