import type { ProjectsRepository, ListProjectsOptions } from './projects.repository.js';
import type { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { CreateProjectRequest, ProjectDTO } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  public async createProject(userId: string, input: CreateProjectRequest): Promise<ProjectDTO> {
    let workspaceId = input.workspaceId;

    if (!workspaceId) {
      const personalWorkspace = await this.workspacesRepository.findPersonalWorkspace(userId);
      if (!personalWorkspace) {
        throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'No workspace found for user.');
      }
      workspaceId = personalWorkspace.id;
    }

    return this.projectsRepository.createProject({
      workspaceId,
      userId,
      name: input.name,
      description: input.description,
      template: input.template,
      engine: input.engine,
    });
  }

  public async listProjects(userId: string, options: ListProjectsOptions = {}): Promise<ProjectDTO[]> {
    return this.projectsRepository.findProjectsByUser(userId, options);
  }

  public async getProject(projectId: string, userId: string): Promise<ProjectDTO> {
    const project = await this.projectsRepository.findProjectById(projectId, userId);
    if (!project) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }
    return project;
  }
}

