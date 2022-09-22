import * as vscode from 'vscode';
import * as Rush from '@rushstack/rush-sdk';
import * as path from 'path';

export type StateGroupName = 'Active' | 'Included' | 'Excluded';

export class ProjectDataProvider
  implements vscode.TreeDataProvider<StateGroup | Project | OperationPhase | Message>
{
  private _workspaceRoot: string | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<
    StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
  >;

  private _pendingRush!: Promise<Rush.RushConfiguration | undefined>;
  private _pendingAllProjects!: Promise<{
    projects: Project[];
    projectsByRushProject: Map<string, Project>;
  }>;

  private _stateGroups: StateGroup[];

  private _activeGroup: StateGroup;
  private _includedGroup: StateGroup;
  private _excludedGroup: StateGroup;
  private _loadRush: () => Promise<typeof Rush>;

  constructor(workspaceRoot: string | undefined, loadRush: () => Promise<typeof Rush>) {
    this._workspaceRoot = workspaceRoot;
    this._loadRush = loadRush;

    this._onDidChangeTreeData = new vscode.EventEmitter<
      StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
    >();

    this._activeGroup = new StateGroup('Active');
    this._includedGroup = new StateGroup('Included');
    this._excludedGroup = new StateGroup('Excluded');

    this.refresh();

    this._stateGroups = [this._activeGroup, this._includedGroup, this._excludedGroup];
  }

  public async refresh(): Promise<void> {
    const workspaceRoot = this._workspaceRoot;

    this._activeGroup.projects.clear();
    this._includedGroup.projects.clear();
    this._excludedGroup.projects.clear();

    vscode.commands.executeCommand('setContext', 'rush.activeProjects.count', 0);
    vscode.commands.executeCommand('setContext', 'rush.includedProjects.count', 0);
    vscode.commands.executeCommand('setContext', 'rush.excludedProjects.count', 0);
    vscode.commands.executeCommand('setContext', 'rush.activeProjects', {});

    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._excludedGroup]);

    if (workspaceRoot) {
      this._pendingRush = (async () => {
        const rushSdk = await this._loadRush();

        if (!rushSdk.RushConfiguration) {
          return;
        }

        const rushConfigurationFile = rushSdk.RushConfiguration.tryFindRushJsonLocation({
          startingFolder: this._workspaceRoot
        });

        if (!rushConfigurationFile) {
          return;
        }

        const rushConfiguration = rushSdk.RushConfiguration.loadFromConfigurationFile(rushConfigurationFile);

        return rushConfiguration;
      })();
    }

    this._pendingAllProjects = (async () => {
      const rush = await this._pendingRush;

      const projectsByRushProject = new Map<string, Project>();
      const projects: Project[] = [];

      if (rush) {
        for (const rushProject of rush.projects) {
          const project = new Project(rushProject);

          projectsByRushProject.set(rushProject.packageName, project);
          projects.push(project);
        }
      }

      return {
        projects,
        projectsByRushProject
      };
    })();

    const { projects } = await this._pendingAllProjects;

    for (const project of projects) {
      this._excludedGroup.projects.add(project);
    }

    const activeProjectsContext: { [key: string]: true } = {};

    for (const activeProject of this._activeGroup.projects) {
      activeProjectsContext[`project:${activeProject.rushProject.packageName}`] = true;
    }

    vscode.commands.executeCommand(
      'setContext',
      'rush.activeProjects.count',
      this._activeGroup.projects.size
    );
    vscode.commands.executeCommand(
      'setContext',
      'rush.includedProjects.count',
      this._includedGroup.projects.size
    );
    vscode.commands.executeCommand(
      'setContext',
      'rush.excludedProjects.count',
      this._excludedGroup.projects.size
    );
    vscode.commands.executeCommand('setContext', 'rush.activeProjects', activeProjectsContext);

    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._excludedGroup]);
  }

  public getActiveProjects(): Project[] {
    return Array.from(this._activeGroup.projects);
  }

  public async toggleActiveProjects(toggleProjects: Project[], force?: boolean): Promise<void> {
    const { projects, projectsByRushProject } = await this._pendingAllProjects;

    if (toggleProjects.length === 0) {
      return;
    }

    this._excludedGroup.projects.clear();

    for (const project of projects) {
      project.stateGroupName = 'Excluded';
      this._excludedGroup.projects.add(project);
    }

    const direction = force ?? !this._activeGroup.projects.has(toggleProjects[0]);

    if (direction) {
      for (const toggleProject of toggleProjects) {
        this._activeGroup.projects.add(toggleProject);
      }
    } else {
      for (const toggleProject of toggleProjects) {
        this._activeGroup.projects.delete(toggleProject);
      }
    }

    const seenProjects = new Set<string>();

    const queue: Project[] = [];

    for (const activeProject of this._activeGroup.projects) {
      activeProject.stateGroupName = 'Active';
      seenProjects.add(activeProject.rushProject.packageName);
      this._excludedGroup.projects.delete(activeProject);
      queue.push(activeProject);
    }

    this._includedGroup.projects.clear();

    let included: Project | undefined;

    while ((included = queue.shift())) {
      for (const dependency of included.rushProject.dependencyProjects) {
        if (!seenProjects.has(dependency.packageName)) {
          const dependencyProject = projectsByRushProject.get(dependency.packageName);

          if (dependencyProject) {
            dependencyProject.stateGroupName = 'Included';
            this._includedGroup.projects.add(dependencyProject);
            this._excludedGroup.projects.delete(dependencyProject);
            queue.push(dependencyProject);
          }

          seenProjects.add(dependency.packageName);
        }
      }
    }

    const activeProjectsContext: { [key: string]: true } = {};

    for (const activeProject of this._activeGroup.projects) {
      activeProjectsContext[`project:${activeProject.rushProject.packageName}`] = true;
    }

    vscode.commands.executeCommand(
      'setContext',
      'rush.activeProjects.count',
      this._activeGroup.projects.size
    );
    vscode.commands.executeCommand(
      'setContext',
      'rush.includedProjects.count',
      this._includedGroup.projects.size
    );
    vscode.commands.executeCommand(
      'setContext',
      'rush.excludedProjects.count',
      this._excludedGroup.projects.size
    );
    vscode.commands.executeCommand('setContext', 'rush.activeProjects', activeProjectsContext);

    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._excludedGroup]);
  }

  public get onDidChangeTreeData(): vscode.Event<
    StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
  > {
    return this._onDidChangeTreeData.event;
  }

  public async getChildren(
    element?: StateGroup | Project | OperationPhase | undefined
  ): Promise<(StateGroup | Project | OperationPhase | Message)[]> {
    const { projects } = await this._pendingAllProjects;

    if (!element) {
      return this._stateGroups;
    } else if (element instanceof StateGroup) {
      if (element.groupName === 'Active') {
        if (this._activeGroup.projects.size === 0) {
          return [new Message('To get started, activate projects from this repository.')];
        }

        return Array.from(this._activeGroup.projects);
      } else if (element.groupName === 'Included') {
        if (this._includedGroup.projects.size === 0) {
          return [new Message('Dependencies of active projects will appear here.')];
        }
        return Array.from(this._includedGroup.projects);
      } else if (element.groupName === 'Excluded') {
        if (!this._activeGroup.projects) {
          return projects;
        }

        return Array.from(this._excludedGroup.projects);
      }

      return [];
    } else {
      return [];
    }
  }

  public getParent(element: Project): vscode.ProviderResult<Project> {
    return undefined;
  }

  public getTreeItem(element: Project | OperationPhase | StateGroup | Message): vscode.TreeItem {
    if (element instanceof Message) {
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

      treeItem.iconPath = '$(sync)';

      treeItem.id = `message:${element.label}`;

      return treeItem;
    } else if (element instanceof Project) {
      const treeItem = new vscode.TreeItem(
        element.rushProject.packageName,
        vscode.TreeItemCollapsibleState.None
      );

      treeItem.contextValue = `project:${element.rushProject.packageName}`;
      treeItem.resourceUri = vscode.Uri.file(path.join(element.rushProject.projectFolder, 'package.json'));
      treeItem.tooltip = element.rushProject.packageJson.description;

      switch (element.stateGroupName) {
        case 'Active':
          treeItem.description = 'Active';
          break;
        case 'Included':
          treeItem.description = 'Ready';
          break;
        case 'Excluded':
          treeItem.description = 'Out of scope';
          break;
      }

      treeItem.id = `project:${element.rushProject.packageName}`;

      treeItem.iconPath = new vscode.ThemeIcon('package');

      return treeItem;
    } else if (element instanceof OperationPhase) {
      const treeItem = new vscode.TreeItem(element.phase, vscode.TreeItemCollapsibleState.None);

      treeItem.id = `phase:${element.rushProject.packageName};_${element.phase}`;

      return treeItem;
    } else if (element instanceof StateGroup) {
      const treeItem = new vscode.TreeItem(element.groupName, vscode.TreeItemCollapsibleState.Expanded);

      treeItem.contextValue = `group:${element.groupName}`;

      treeItem.id = `group:${element.groupName}`;

      return treeItem;
    }

    throw new Error('Unknown element type!');
  }
}

export class Project {
  public readonly rushProject: Rush.RushConfigurationProject;

  public stateGroupName: StateGroupName;

  constructor(rushProject: Rush.RushConfigurationProject) {
    this.rushProject = rushProject;

    this.stateGroupName = 'Excluded';
  }
}

export class OperationPhase {
  public readonly phase: string;
  public readonly rushProject: Rush.RushConfigurationProject;

  constructor(rushProject: Rush.RushConfigurationProject, phase: string) {
    this.phase = phase;
    this.rushProject = rushProject;
  }
}

export class StateGroup {
  public readonly groupName: StateGroupName;

  public readonly projects: Set<Project>;

  constructor(groupName: StateGroupName) {
    this.groupName = groupName;

    this.projects = new Set<Project>();
  }
}

export class Message {
  public readonly label: string;

  constructor(label: string) {
    this.label = label;
  }
}
