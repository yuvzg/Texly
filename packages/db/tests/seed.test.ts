import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, type TestDatabase } from './helper.js';
import { runSeed } from '../prisma/seed.js';

describe('Database Seed Script', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase();
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  it('populates demo user, workspace, welcome project, and templates', async () => {
    await runSeed(db.client);

    // Verify Demo User
    const demoUser = await db.client.user.findUnique({
      where: { email: 'demo@texly.app' },
      include: { settings: true },
    });
    expect(demoUser).not.toBeNull();
    expect(demoUser?.name).toBe('Demo Author');
    expect(demoUser?.emailVerifiedAt).not.toBeNull();
    expect(demoUser?.settings?.theme).toBe('system');
    expect(demoUser?.settings?.editorFontSize).toBe(14);

    // Verify Demo Workspace
    const workspace = await db.client.workspace.findUnique({
      where: { slug: 'demo-workspace' },
      include: { members: true },
    });
    expect(workspace).not.toBeNull();
    expect(workspace?.isPersonal).toBe(true);
    expect(workspace?.members.length).toBe(1);
    expect(workspace?.members[0]?.userId).toBe(demoUser?.id);

    // Verify Welcome Project
    const project = await db.client.project.findFirst({
      where: { name: 'Welcome to Texly' },
      include: {
        files: {
          include: {
            document: true,
          },
        },
      },
    });
    expect(project).not.toBeNull();
    expect(project?.mainFileId).toBeDefined();
    expect(project?.files.length).toBe(2);

    const mainFile = project?.files.find((f) => f.name === 'main.tex');
    expect(mainFile).toBeDefined();
    expect(mainFile?.document?.content).toContain('\\title{Welcome to Texly}');

    const bibFile = project?.files.find((f) => f.name === 'references.bib');
    expect(bibFile).toBeDefined();
    expect(bibFile?.document?.content).toContain('texly2026');

    // Verify Academic Template Project
    const templateProject = await db.client.project.findFirst({
      where: { templateKey: 'academic-article' },
      include: { files: true },
    });
    expect(templateProject).not.toBeNull();
    expect(templateProject?.files.length).toBe(1);
  });

  it('seed execution is idempotent when executed repeatedly', async () => {
    await expect(runSeed(db.client)).resolves.not.toThrow();

    const countUsers = await db.client.user.count({ where: { email: 'demo@texly.app' } });
    expect(countUsers).toBe(1);

    const countWorkspaces = await db.client.workspace.count({ where: { slug: 'demo-workspace' } });
    expect(countWorkspaces).toBe(1);
  });
});
