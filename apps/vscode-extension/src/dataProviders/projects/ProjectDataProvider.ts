import * as vscode from 'vscode';
import * as Rush from '@rushstack/rush-sdk';
import * as path from 'path';

declare const global: NodeJS.Global &
  typeof globalThis & {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ___rush___workingDirectory?: string;
  };

export class ProjectDataProvider implements vscode.TreeDataProvider<StateGroup | Project | OperationPhase> {
  private _workspaceRoot: string | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<StateGroup | Project | OperationPhase | undefined | void>;
  private _rush: Promise<Rush.RushConfiguration | undefined> | undefined;

  private _activeProjects: Set<Project>;
  private _includedProjects: Set<Project>;

  private _pendingAllProjects: Promise<{
    projects: Project[];
    projectsByRushProject: Map<Rush.RushConfigurationProject, Project>;
  }>;

  private _stateGroups: StateGroup[] = [];

  constructor(workspaceRoot: string | undefined) {
    this._workspaceRoot = workspaceRoot;
    this._onDidChangeTreeData = new vscode.EventEmitter<
      StateGroup | Project | OperationPhase | undefined | void
    >();
    this._activeProjects = new Set<Project>();
    this._includedProjects = new Set<Project>();

    if (workspaceRoot) {
      global.___rush___workingDirectory = workspaceRoot;

      this._rush = (async () => {
        const rushSdk = await import('@rushstack/rush-sdk');

        const rushConfigurationFile = rushSdk.RushConfiguration.tryFindRushJsonLocation({
          startingFolder: this._workspaceRoot
        });

        if (rushConfigurationFile) {
          const rushConfiguration =
            rushSdk.RushConfiguration.loadFromConfigurationFile(rushConfigurationFile);

          return rushConfiguration;
        }

        return undefined;
      })();
    }

    this._pendingAllProjects = (async () => {
      const rush = await this._rush;

      const projectsByRushProject = new Map<Rush.RushConfigurationProject, Project>();
      const projects: Project[] = [];

      if (rush) {
        for (const rushProject of rush.projects) {
          const project = new Project(rushProject);

          projectsByRushProject.set(rushProject, project);
          projects.push(project);
        }
      }

      return {
        projects,
        projectsByRushProject
      };
    })();

    this._stateGroups = [new StateGroup('Active'), new StateGroup('Included'), new StateGroup('Excluded')];
  }

  public getActiveProjects(): Project[] {
    const projects: Project[] = [];

    for (const project of this._activeProjects) {
      projects.push(project);
    }

    return projects;
  }

  public async toggleActiveProjects(toggleProjects: Project[], force?: boolean): Promise<void> {
    const { projects, projectsByRushProject } = await this._pendingAllProjects;

    if (toggleProjects.length === 0) {
      return;
    }

    const direction = force ?? !this._activeProjects.has(toggleProjects[0]);

    if (direction) {
      for (const toggleProject of toggleProjects) {
        this._activeProjects.add(toggleProject);
      }
    } else {
      for (const toggleProject of toggleProjects) {
        this._activeProjects.delete(toggleProject);
      }
    }

    const seenProjects = new Set<Rush.RushConfigurationProject>();

    const queue: Project[] = [];

    for (const activeProject of this._activeProjects) {
      seenProjects.add(activeProject.rushProject);
      queue.push(activeProject);
    }

    this._includedProjects.clear();

    let included: Project | undefined;

    while ((included = queue.shift())) {
      const dependencies = included.dependencies;

      for (const dependency of dependencies) {
        if (!seenProjects.has(dependency)) {
          const dependencyProject = projectsByRushProject.get(dependency);

          if (dependencyProject) {
            this._includedProjects.add(dependencyProject);
            queue.push(dependencyProject);
          }

          seenProjects.add(dependency);
        }
      }
    }

    this._onDidChangeTreeData.fire(undefined);

    for (const project of toggleProjects) {
      this._onDidChangeTreeData.fire(project);
    }
  }

  public get onDidChangeTreeData(): vscode.Event<StateGroup | Project | OperationPhase | undefined | void> {
    return this._onDidChangeTreeData.event;
  }

  public async getChildren(
    element?: StateGroup | Project | OperationPhase | undefined
  ): Promise<(StateGroup | Project | OperationPhase)[]> {
    const { projects, projectsByRushProject } = await this._pendingAllProjects;

    if (!element) {
      if (this._activeProjects.size === 0) {
        return projects;
      }

      return this._stateGroups;
    } else if (element instanceof StateGroup) {
      if (element.groupName === 'Active') {
        const activeProjects: Project[] = [];

        for (const activeProject of this._activeProjects) {
          activeProjects.push(activeProject);
        }

        return activeProjects;
      } else if (element.groupName === 'Included') {
        const seenProjects = new Set<Rush.RushConfigurationProject>();

        const queue: Project[] = [];

        for (const activeProject of this._activeProjects) {
          seenProjects.add(activeProject.rushProject);
          queue.push(activeProject);
        }

        const includedProjects: Project[] = [];

        for (const includedProject of this._includedProjects) {
          includedProjects.push(includedProject);
        }

        return includedProjects;
      } else if (element.groupName === 'Excluded') {
        const excludedProjects: Project[] = [];

        for (const project of projects) {
          if (!this._activeProjects.has(project) && !this._includedProjects.has(project)) {
            excludedProjects.push(project);
          }
        }

        return excludedProjects;
      }

      return [];
    } else if (element instanceof Project) {
      const projects = element.dependencies.map((rushProject: Rush.RushConfigurationProject) => {
        return new Project(rushProject);
      });

      return projects;
    } else {
      return [];
    }
  }

  public getParent(element: Project): vscode.ProviderResult<Project> {
    return undefined;
  }

  public getTreeItem(element: Project): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
}

export class Project extends vscode.TreeItem {
  public readonly rushProject: Rush.RushConfigurationProject;

  public get dependencies(): Rush.RushConfigurationProject[] {
    const dependencies: Rush.RushConfigurationProject[] = [];

    this.rushProject.dependencyProjects.forEach((rushProject: Rush.RushConfigurationProject) => {
      dependencies.push(rushProject);
    });

    return dependencies;
  }

  constructor(rushProject: Rush.RushConfigurationProject) {
    super(rushProject.packageName, vscode.TreeItemCollapsibleState.None);

    this.description = rushProject.packageJson.version;
    this.tooltip = rushProject.packageJson.description;
    const url = vscode.Uri.file(path.join(rushProject.projectFolder, 'package.json'));
    this.resourceUri = url;
    this.contextValue = url.toString();

    this.rushProject = rushProject;
  }
}

export class OperationPhase extends vscode.TreeItem {
  public readonly phase: string;
  public readonly rushProject: Rush.RushConfigurationProject;

  constructor(rushProject: Rush.RushConfigurationProject, phase: string) {
    super(phase, vscode.TreeItemCollapsibleState.None);

    this.phase = phase;
    this.rushProject = rushProject;
  }
}

export class StateGroup extends vscode.TreeItem {
  public readonly groupName: 'Active' | 'Included' | 'Excluded';

  constructor(groupName: 'Active' | 'Included' | 'Excluded') {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);

    this.groupName = groupName;
  }
}
