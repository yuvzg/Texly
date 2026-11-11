-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'COMMENTER', 'VIEWER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FileNodeType" AS ENUM ('FILE', 'FOLDER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('TEXT', 'BINARY');

-- CreateEnum
CREATE TYPE "LatexEngine" AS ENUM ('PDFLATEX', 'XELATEX', 'LUALATEX');

-- CreateEnum
CREATE TYPE "BibTool" AS ENUM ('AUTO', 'BIBTEX', 'BIBER', 'NONE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'DELETING', 'DELETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('CHECKPOINT', 'MANUAL', 'PRE_AI', 'AI_ACCEPT', 'PRE_RESTORE', 'RESTORE', 'IMPORT');

-- CreateEnum
CREATE TYPE "CompilationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CompilationTrigger" AS ENUM ('MANUAL', 'AUTO', 'AI_ACCEPT', 'RESTORE');

-- CreateEnum
CREATE TYPE "DiagnosticLevel" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('QUEUED', 'GENERATING', 'PENDING', 'ACCEPTED', 'REJECTED', 'STALE', 'SUPERSEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'TEAM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "avatar_key" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "theme" VARCHAR(16) NOT NULL DEFAULT 'system',
    "editor_font_size" INTEGER NOT NULL DEFAULT 14,
    "keymap" VARCHAR(16) NOT NULL DEFAULT 'default',
    "default_model_id" VARCHAR(80),
    "auto_compile" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" VARCHAR(400),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "engine" "LatexEngine" NOT NULL DEFAULT 'PDFLATEX',
    "bib_tool" "BibTool" NOT NULL DEFAULT 'AUTO',
    "main_file_id" UUID,
    "auto_compile" BOOLEAN NOT NULL DEFAULT false,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "template_key" VARCHAR(60),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "trashed_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "last_opened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "project_invites" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "path" VARCHAR(1024) NOT NULL,
    "node_type" "FileNodeType" NOT NULL,
    "kind" "FileKind",
    "mime_type" VARCHAR(120),
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "size_bytes" INTEGER NOT NULL,
    "symbols" JSONB,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "source" "VersionSource" NOT NULL,
    "label" VARCHAR(160),
    "proposal_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID,
    "label" VARCHAR(160) NOT NULL,
    "manifest" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_assets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "object_key" VARCHAR(512) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compilations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "status" "CompilationStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "CompilationTrigger" NOT NULL DEFAULT 'MANUAL',
    "engine" "LatexEngine" NOT NULL,
    "bib_tool" "BibTool" NOT NULL,
    "main_file_path" VARCHAR(1024) NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "inputs_key" TEXT,
    "doc_revisions" JSONB NOT NULL,
    "cache_hit_of_id" UUID,
    "bull_job_id" TEXT,
    "worker_id" TEXT,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "exit_code" INTEGER,
    "error_code" VARCHAR(60),
    "pdf_key" TEXT,
    "pdf_size_bytes" BIGINT,
    "page_count" INTEGER,
    "synctex_key" TEXT,
    "log_key" TEXT,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compilations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compilation_logs" (
    "id" UUID NOT NULL,
    "compilation_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "level" "DiagnosticLevel" NOT NULL,
    "file" VARCHAR(1024),
    "line" INTEGER,
    "message" VARCHAR(2000) NOT NULL,
    "context" VARCHAR(2000),
    "kind" VARCHAR(40),

    CONSTRAINT "compilation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "mode" VARCHAR(16),
    "provider" VARCHAR(40),
    "model" VARCHAR(80),
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_proposals" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "request_message_id" UUID NOT NULL,
    "response_message_id" UUID,
    "document_id" UUID NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'QUEUED',
    "base_revision" INTEGER NOT NULL,
    "base_content_hash" CHAR(64) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "prompt_version" VARCHAR(20) NOT NULL,
    "scope" JSONB,
    "context_manifest" JSONB,
    "edit_ops" JSONB,
    "proposed_content" TEXT,
    "proposed_content_hash" CHAR(64),
    "summary" VARCHAR(2000),
    "diff_stats" JSONB,
    "validation" JSONB,
    "error_code" VARCHAR(60),
    "error_message" VARCHAR(1000),
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_micros" BIGINT,
    "latency_ms" INTEGER,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "result_revision" INTEGER,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "proposal_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "tokens_cached" INTEGER,
    "cost_micros" BIGINT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(4000) NOT NULL,
    "anchor" JSONB NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" VARCHAR(20) NOT NULL DEFAULT 'stripe',
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_deletion_tasks" (
    "id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "reason" VARCHAR(60) NOT NULL,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_deletion_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_user_id_type_idx" ON "verification_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_main_file_id_key" ON "projects"("main_file_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_trashed_at_idx" ON "projects"("workspace_id", "trashed_at");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_last_opened_at_idx" ON "project_members"("user_id", "last_opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_invites_token_hash_key" ON "project_invites"("token_hash");

-- CreateIndex
CREATE INDEX "project_invites_project_id_status_idx" ON "project_invites"("project_id", "status");

-- CreateIndex
CREATE INDEX "project_invites_email_idx" ON "project_invites"("email");

-- CreateIndex
CREATE INDEX "project_files_project_id_parent_id_idx" ON "project_files"("project_id", "parent_id");

-- CreateIndex
CREATE INDEX "project_files_project_id_deleted_at_idx" ON "project_files"("project_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_file_id_key" ON "documents"("file_id");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "document_versions_document_id_created_at_idx" ON "document_versions"("document_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_revision_key" ON "document_versions"("document_id", "revision");

-- CreateIndex
CREATE INDEX "project_snapshots_project_id_created_at_idx" ON "project_snapshots"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_assets_file_id_key" ON "uploaded_assets"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_assets_object_key_key" ON "uploaded_assets"("object_key");

-- CreateIndex
CREATE INDEX "uploaded_assets_project_id_status_idx" ON "uploaded_assets"("project_id", "status");

-- CreateIndex
CREATE INDEX "uploaded_assets_status_created_at_idx" ON "uploaded_assets"("status", "created_at");

-- CreateIndex
CREATE INDEX "compilations_project_id_queued_at_idx" ON "compilations"("project_id", "queued_at" DESC);

-- CreateIndex
CREATE INDEX "compilations_project_id_input_hash_idx" ON "compilations"("project_id", "input_hash");

-- CreateIndex
CREATE INDEX "compilations_status_queued_at_idx" ON "compilations"("status", "queued_at");

-- CreateIndex
CREATE INDEX "compilation_logs_compilation_id_level_idx" ON "compilation_logs"("compilation_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "compilation_logs_compilation_id_ordinal_key" ON "compilation_logs"("compilation_id", "ordinal");

-- CreateIndex
CREATE INDEX "ai_conversations_project_id_user_id_updated_at_idx" ON "ai_conversations"("project_id", "user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_proposals_request_message_id_key" ON "ai_proposals"("request_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_proposals_response_message_id_key" ON "ai_proposals"("response_message_id");

-- CreateIndex
CREATE INDEX "ai_proposals_document_id_status_idx" ON "ai_proposals"("document_id", "status");

-- CreateIndex
CREATE INDEX "ai_proposals_conversation_id_created_at_idx" ON "ai_proposals"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_proposals_status_expires_at_idx" ON "ai_proposals"("status", "expires_at");

-- CreateIndex
CREATE INDEX "llm_usage_events_workspace_id_created_at_idx" ON "llm_usage_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "llm_usage_events_user_id_created_at_idx" ON "llm_usage_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_document_id_resolved_at_idx" ON "comments"("document_id", "resolved_at");

-- CreateIndex
CREATE INDEX "comments_project_id_idx" ON "comments"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "subscriptions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "storage_deletion_tasks_completed_at_run_after_idx" ON "storage_deletion_tasks"("completed_at", "run_after");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_main_file_id_fkey" FOREIGN KEY ("main_file_id") REFERENCES "project_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "project_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "project_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compilations" ADD CONSTRAINT "compilations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compilations" ADD CONSTRAINT "compilations_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compilation_logs" ADD CONSTRAINT "compilation_logs_compilation_id_fkey" FOREIGN KEY ("compilation_id") REFERENCES "compilations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_request_message_id_fkey" FOREIGN KEY ("request_message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Raw SQL Constraints & Indexes (§6 of DATABASE_DESIGN.md) ─────────────

-- Unique live path per project
CREATE UNIQUE INDEX "project_files_project_path_live_uq"
  ON "project_files" ("project_id", "path") WHERE "deleted_at" IS NULL;

-- Case-insensitive sibling uniqueness
CREATE UNIQUE INDEX "project_files_project_path_ci_live_uq"
  ON "project_files" ("project_id", lower("path")) WHERE "deleted_at" IS NULL;

-- At most one ACTIVE AI proposal per document
CREATE UNIQUE INDEX "ai_proposals_one_active_per_document_uq"
  ON "ai_proposals" ("document_id") WHERE "status" IN ('QUEUED', 'GENERATING', 'PENDING');

-- At most one RUNNING compilation per project (QUEUED ones are coalesced by service)
CREATE UNIQUE INDEX "compilations_one_running_per_project_uq"
  ON "compilations" ("project_id") WHERE "status" = 'RUNNING';

-- Email lowercase constraint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower_ck" CHECK ("email" = lower("email"));

-- Document max size 2 MiB and minimum revision 1
ALTER TABLE "documents" ADD CONSTRAINT "documents_size_ck" CHECK ("size_bytes" <= 2097152 AND "revision" >= 1);

-- Valid proposal payload when status is PENDING
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_pending_payload_ck"
  CHECK ("status" <> 'PENDING' OR ("proposed_content" IS NOT NULL AND "proposed_content_hash" IS NOT NULL AND "edit_ops" IS NOT NULL));

-- Valid asset state when status is READY
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_ready_ck"
  CHECK ("status" <> 'READY' OR ("sha256" IS NOT NULL AND "ready_at" IS NOT NULL));

-- Autovacuum tuning for hot documents table
ALTER TABLE "documents" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
