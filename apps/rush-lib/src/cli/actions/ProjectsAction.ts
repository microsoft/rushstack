import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';

export class ProjectsAction extends BaseRushAction {
  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'projects',
      summary: 'List package names for all projects in the repo',
      documentation:
        'This lists package name for projects from current rush configuration.',
      parser
    });
  }
  protected run(): Promise<void> {
    return Promise.resolve().then(() => {
      const projects: string[] = this.rushConfiguration.projects.map(
        project => project.packageName
      );
      projects.forEach(project => {
        console.log(project);
      });
    });
  }
  protected onDefineParameters(): void {
    // No parameters
  }
}
