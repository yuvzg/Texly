import { createHash } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { resolveDatabaseConfig } from '../src/config.js';
import {
  WorkspaceRole,
  ProjectRole,
  FileNodeType,
  FileKind,
  LatexEngine,
  BibTool,
} from '../src/types.js';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runSeed(client: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to execute development database seed in production environment.');
  }

  const DEMO_USER_ID = '01931a00-0000-7000-8000-000000000001';
  const DEMO_WORKSPACE_ID = '01931a00-0000-7000-8000-000000000002';
  const DEMO_PROJECT_ID = '01931a00-0000-7000-8000-000000000003';
  const DEMO_MAIN_FILE_ID = '01931a00-0000-7000-8000-000000000004';
  const DEMO_MAIN_DOC_ID = '01931a00-0000-7000-8000-000000000005';
  const DEMO_BIB_FILE_ID = '01931a00-0000-7000-8000-000000000006';
  const DEMO_BIB_DOC_ID = '01931a00-0000-7000-8000-000000000007';

  const TEMPLATE_PROJECT_ID = '01931a00-0000-7000-8000-000000000010';
  const TEMPLATE_MAIN_FILE_ID = '01931a00-0000-7000-8000-000000000011';
  const TEMPLATE_MAIN_DOC_ID = '01931a00-0000-7000-8000-000000000012';

  // 1. Create or update Demo User
  const demoUser = await client.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {
      email: 'demo@texly.app',
      name: 'Demo Author',
    },
    create: {
      id: DEMO_USER_ID,
      email: 'demo@texly.app',
      name: 'Demo Author',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dev_only_password_hash_never_use_in_prod',
      emailVerifiedAt: new Date(),
    },
  });

  // 2. User Settings
  await client.userSettings.upsert({
    where: { userId: demoUser.id },
    update: {
      theme: 'system',
      editorFontSize: 14,
      keymap: 'default',
      autoCompile: false,
    },
    create: {
      userId: demoUser.id,
      theme: 'system',
      editorFontSize: 14,
      keymap: 'default',
      autoCompile: false,
    },
  });

  // 3. Personal Workspace
  const workspace = await client.workspace.upsert({
    where: { id: DEMO_WORKSPACE_ID },
    update: {
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      isPersonal: true,
    },
    create: {
      id: DEMO_WORKSPACE_ID,
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      isPersonal: true,
    },
  });

  // Workspace Membership
  await client.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: demoUser.id,
      },
    },
    update: { role: WorkspaceRole.OWNER },
    create: {
      workspaceId: workspace.id,
      userId: demoUser.id,
      role: WorkspaceRole.OWNER,
    },
  });

  // 4. Welcome Project
  const welcomeLatex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{cite}

\\title{Welcome to Texly}
\\author{Demo Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Texly is a modern, web-based collaborative LaTeX editor with built-in AI assistance and instant compilation.
\\end{abstract}

\\section{Introduction}
Welcome to your new document! You can edit this LaTeX source in real time.
Reference to foundational paper: \\cite{texly2026}.

\\section{Mathematics}
Here is an example equation:
\\begin{equation}
E = mc^2
\\end{equation}

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

  const welcomeBib = `@article{texly2026,
  author = {Texly Team},
  title = {Next-Generation Collaborative LaTeX Authoring},
  journal = {Journal of Software Systems},
  year = {2026},
  volume = {1},
  pages = {1--10}
}
`;

  const project = await client.project.upsert({
    where: { id: DEMO_PROJECT_ID },
    update: {
      name: 'Welcome to Texly',
      description: 'An interactive example LaTeX project demonstrating Texly capabilities.',
      engine: LatexEngine.PDFLATEX,
      bibTool: BibTool.AUTO,
    },
    create: {
      id: DEMO_PROJECT_ID,
      workspaceId: workspace.id,
      createdById: demoUser.id,
      name: 'Welcome to Texly',
      description: 'An interactive example LaTeX project demonstrating Texly capabilities.',
      engine: LatexEngine.PDFLATEX,
      bibTool: BibTool.AUTO,
      storageBytes: BigInt(welcomeLatex.length + welcomeBib.length),
    },
  });

  await client.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: demoUser.id,
      },
    },
    update: { role: ProjectRole.OWNER },
    create: {
      projectId: project.id,
      userId: demoUser.id,
      role: ProjectRole.OWNER,
    },
  });

  // Main file node
  const mainFile = await client.projectFile.upsert({
    where: { id: DEMO_MAIN_FILE_ID },
    update: {
      name: 'main.tex',
      path: 'main.tex',
      sizeBytes: BigInt(welcomeLatex.length),
    },
    create: {
      id: DEMO_MAIN_FILE_ID,
      projectId: project.id,
      name: 'main.tex',
      path: 'main.tex',
      nodeType: FileNodeType.FILE,
      kind: FileKind.TEXT,
      mimeType: 'application/x-tex',
      sizeBytes: BigInt(welcomeLatex.length),
      createdById: demoUser.id,
    },
  });

  await client.document.upsert({
    where: { fileId: mainFile.id },
    update: {
      content: welcomeLatex,
      contentHash: sha256(welcomeLatex),
      sizeBytes: welcomeLatex.length,
      revision: 1,
    },
    create: {
      id: DEMO_MAIN_DOC_ID,
      fileId: mainFile.id,
      projectId: project.id,
      content: welcomeLatex,
      contentHash: sha256(welcomeLatex),
      revision: 1,
      sizeBytes: welcomeLatex.length,
      updatedById: demoUser.id,
    },
  });

  // Bibliography file node
  const bibFile = await client.projectFile.upsert({
    where: { id: DEMO_BIB_FILE_ID },
    update: {
      name: 'references.bib',
      path: 'references.bib',
      sizeBytes: BigInt(welcomeBib.length),
    },
    create: {
      id: DEMO_BIB_FILE_ID,
      projectId: project.id,
      name: 'references.bib',
      path: 'references.bib',
      nodeType: FileNodeType.FILE,
      kind: FileKind.TEXT,
      mimeType: 'application/x-bibtex',
      sizeBytes: BigInt(welcomeBib.length),
      createdById: demoUser.id,
    },
  });

  await client.document.upsert({
    where: { fileId: bibFile.id },
    update: {
      content: welcomeBib,
      contentHash: sha256(welcomeBib),
      sizeBytes: welcomeBib.length,
      revision: 1,
    },
    create: {
      id: DEMO_BIB_DOC_ID,
      fileId: bibFile.id,
      projectId: project.id,
      content: welcomeBib,
      contentHash: sha256(welcomeBib),
      revision: 1,
      sizeBytes: welcomeBib.length,
      updatedById: demoUser.id,
    },
  });

  // Set project's main file
  await client.project.update({
    where: { id: project.id },
    data: { mainFileId: mainFile.id },
  });

  // 5. Example Academic Article Template Project
  const templateLatex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}

\\title{Academic Paper Template}
\\author{Author Name \\\\ Department of Computer Science}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\section{Introduction}
Introduction to your research.

\\end{document}
`;

  const templateProject = await client.project.upsert({
    where: { id: TEMPLATE_PROJECT_ID },
    update: {
      name: 'Academic Paper Template',
      templateKey: 'academic-article',
    },
    create: {
      id: TEMPLATE_PROJECT_ID,
      workspaceId: workspace.id,
      createdById: demoUser.id,
      name: 'Academic Paper Template',
      description: 'Standard single-column academic article template.',
      templateKey: 'academic-article',
      engine: LatexEngine.PDFLATEX,
      bibTool: BibTool.AUTO,
      storageBytes: BigInt(templateLatex.length),
    },
  });

  await client.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: templateProject.id,
        userId: demoUser.id,
      },
    },
    update: { role: ProjectRole.OWNER },
    create: {
      projectId: templateProject.id,
      userId: demoUser.id,
      role: ProjectRole.OWNER,
    },
  });

  const templateMainFile = await client.projectFile.upsert({
    where: { id: TEMPLATE_MAIN_FILE_ID },
    update: {
      name: 'main.tex',
      path: 'main.tex',
      sizeBytes: BigInt(templateLatex.length),
    },
    create: {
      id: TEMPLATE_MAIN_FILE_ID,
      projectId: templateProject.id,
      name: 'main.tex',
      path: 'main.tex',
      nodeType: FileNodeType.FILE,
      kind: FileKind.TEXT,
      mimeType: 'application/x-tex',
      sizeBytes: BigInt(templateLatex.length),
      createdById: demoUser.id,
    },
  });

  await client.document.upsert({
    where: { fileId: templateMainFile.id },
    update: {
      content: templateLatex,
      contentHash: sha256(templateLatex),
      sizeBytes: templateLatex.length,
      revision: 1,
    },
    create: {
      id: TEMPLATE_MAIN_DOC_ID,
      fileId: templateMainFile.id,
      projectId: templateProject.id,
      content: templateLatex,
      contentHash: sha256(templateLatex),
      revision: 1,
      sizeBytes: templateLatex.length,
      updatedById: demoUser.id,
    },
  });

  await client.project.update({
    where: { id: templateProject.id },
    data: { mainFileId: templateMainFile.id },
  });
}

async function main() {
  const config = resolveDatabaseConfig();
  const pool = new pg.Pool({ connectionString: config.url });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  try {
    console.info('Seeding development database...');
    await runSeed(client);
    console.info('✔ Database seeded successfully.');
  } finally {
    await client.$disconnect();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  main().catch((err) => {
    console.error('Database seed failed:', err);
    process.exit(1);
  });
}
