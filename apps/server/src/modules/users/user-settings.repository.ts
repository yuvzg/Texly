import type { PrismaClient, UserSettings } from '@texly/db';
import type { DbClient } from '../auth/types.js';

export interface UpdateUserSettingsData {
  theme?: string | undefined;
  editorFontSize?: number | undefined;
  keymap?: string | undefined;
  defaultModelId?: string | null | undefined;
  autoCompile?: boolean | undefined;
  layout?: Record<string, unknown> | null | undefined;
}

export class UserSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  async findByUserId(userId: string, tx?: DbClient): Promise<UserSettings | null> {
    return this.getClient(tx).userSettings.findUnique({
      where: { userId },
    });
  }

  async upsert(userId: string, data: UpdateUserSettingsData, tx?: DbClient): Promise<UserSettings> {
    const layoutCreate = data.layout ? JSON.parse(JSON.stringify(data.layout)) : {};

    return this.getClient(tx).userSettings.upsert({
      where: { userId },
      create: {
        userId,
        theme: data.theme ?? 'system',
        editorFontSize: data.editorFontSize ?? 14,
        keymap: data.keymap ?? 'default',
        defaultModelId: data.defaultModelId ?? 'openai:gpt-4o',
        autoCompile: data.autoCompile ?? false,
        layout: layoutCreate,
      },
      update: {
        ...(data.theme !== undefined ? { theme: data.theme } : {}),
        ...(data.editorFontSize !== undefined ? { editorFontSize: data.editorFontSize } : {}),
        ...(data.keymap !== undefined ? { keymap: data.keymap } : {}),
        ...(data.defaultModelId !== undefined ? { defaultModelId: data.defaultModelId } : {}),
        ...(data.autoCompile !== undefined ? { autoCompile: data.autoCompile } : {}),
        ...(data.layout !== undefined
          ? { layout: data.layout ? JSON.parse(JSON.stringify(data.layout)) : {} }
          : {}),
      },
    });
  }
}
