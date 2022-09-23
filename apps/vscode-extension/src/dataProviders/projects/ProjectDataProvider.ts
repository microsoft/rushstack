import * as vscode from 'vscode';
import type * as Rush from '@rushstack/rush-sdk';
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
    projectsByName: Map<string, Project>;
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
        projectsByName: projectsByRushProject
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

  public getIncludedProjects(): Project[] {
    return Array.from(this._includedGroup.projects);
  }

  public async updateProjectPhases(operationStatuses: Rush.ITransferableOperationStatus[]): Promise<void> {
    const { projectsByName } = await this._pendingAllProjects;

    const projects: Project[] = [];

    for (const operationStatus of operationStatuses) {
      const {
        operation: { project: projectName, phase }
      } = operationStatus;

      if (!projectName || !phase) {
        continue;
      }

      const project = projectsByName.get(projectName);

      if (!project) {
        continue;
      }

      let operationPhase = project.phases.get(phase);

      if (!operationPhase) {
        operationPhase = new OperationPhase(project.rushProject, operationStatus);
        project.phases.set(phase, operationPhase);
      }

      operationPhase.operationStatus = operationStatus;

      projects.push(project);
    }

    this._onDidChangeTreeData.fire(projects);
  }

  public async toggleActiveProjects(toggleProjects: Project[], force?: boolean): Promise<void> {
    const { projects, projectsByName: projectsByRushProject } = await this._pendingAllProjects;

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
    } else if (element instanceof Project) {
      return Array.from(element.phases.values());
    }

    return [];
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
        element.phases.size > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );

      treeItem.contextValue = `project:${element.rushProject.packageName}`;
      treeItem.resourceUri = vscode.Uri.file(path.join(element.rushProject.projectFolder, 'package.json'));
      treeItem.tooltip = element.rushProject.packageJson.description;

      switch (element.stateGroupName) {
        case 'Active':
        case 'Included':
          if (element.phases.size > 0) {
            const status = getOverallStatus(getStatuses(element.phases.values()));

            const { icon, description } = getStatusIndicators(status);

            treeItem.description = description;
            treeItem.iconPath = new vscode.ThemeIcon(icon);
          } else {
            treeItem.description = 'Ready';
            treeItem.iconPath = new vscode.ThemeIcon('package');
          }
          break;
        case 'Excluded':
          treeItem.description = 'Out of scope';
          treeItem.iconPath = new vscode.ThemeIcon('package');
          break;
      }

      treeItem.id = `project:${element.rushProject.packageName}`;

      return treeItem;
    } else if (element instanceof OperationPhase) {
      const treeItem = new vscode.TreeItem(
        element.operationStatus.operation.phase!,
        vscode.TreeItemCollapsibleState.None
      );

      treeItem.id = `phase:${element.rushProject.packageName};_${element.operationStatus.operation.phase!}`;

      const { icon, description } = getStatusIndicators(element.operationStatus.status);

      treeItem.iconPath = new vscode.ThemeIcon(icon);
      treeItem.description = `${description} (${element.operationStatus.hash})`;
      if (element.operationStatus.operation.logFilePath) {
        const uri = vscode.Uri.file(element.operationStatus.operation.logFilePath);
        treeItem.resourceUri = uri;
        treeItem.command = {
          command: 'vscode.open',
          title: 'Open',
          arguments: [uri]
        };
      }

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

  public phases: Map<string, OperationPhase>;

  constructor(rushProject: Rush.RushConfigurationProject) {
    this.rushProject = rushProject;

    this.stateGroupName = 'Excluded';

    this.phases = new Map<string, OperationPhase>();
  }
}

export class OperationPhase {
  public readonly rushProject: Rush.RushConfigurationProject;
  public operationStatus: Rush.ITransferableOperationStatus;

  constructor(
    rushProject: Rush.RushConfigurationProject,
    operationStatus: Rush.ITransferableOperationStatus
  ) {
    this.operationStatus = operationStatus;
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

function getOverallStatus(statuses: Iterable<Rush.OperationStatus>): Rush.OperationStatus {
  const histogram: {
    [P in Rush.OperationStatus]: number;
  } = {
    'FROM CACHE': 0,
    'NO OP': 0,
    'SUCCESS WITH WARNINGS': 0,
    BLOCKED: 0,
    EXECUTING: 0,
    FAILURE: 0,
    READY: 0,
    SKIPPED: 0,
    SUCCESS: 0
  };

  for (const status of statuses) {
    histogram[status]++;
  }

  if (histogram.EXECUTING > 0) {
    return 'EXECUTING' as Rush.OperationStatus;
  } else if (histogram.READY > 0) {
    return 'READY' as Rush.OperationStatus;
  } else if (histogram.FAILURE > 0) {
    return 'FAILURE' as Rush.OperationStatus;
  } else if (histogram.BLOCKED > 0) {
    return 'BLOCKED' as Rush.OperationStatus;
  } else if (histogram['SUCCESS WITH WARNINGS'] > 0) {
    return 'SUCCESS WITH WARNINGS' as Rush.OperationStatus;
  } else if (histogram.SUCCESS > 0) {
    return 'SUCCESS' as Rush.OperationStatus;
  } else if (histogram['FROM CACHE'] > 0) {
    return 'FROM CACHE' as Rush.OperationStatus;
  } else if (histogram.SKIPPED > 0) {
    return 'SKIPPED' as Rush.OperationStatus;
  } else {
    return 'NO OP' as Rush.OperationStatus;
  }
}

function getStatusIndicators(status: Rush.OperationStatus): {
  icon: string;
  description: string;
} {
  let icon: string;
  let description: string;

  switch (status) {
    case 'SUCCESS':
      description = 'Succeeded';
      icon = 'check';
      break;
    case 'FROM CACHE':
      description = 'Succeeded (from cache)';
      icon = 'check';
      break;
    case 'NO OP':
      description = 'Bypassed';
      icon = 'check';
      break;
    case 'EXECUTING':
      description = 'Executing';
      icon = 'sync~spin';
      break;
    case 'SUCCESS WITH WARNINGS':
      description = 'Succeeded with warnings';
      icon = 'warning';
      break;
    case 'SKIPPED':
      description = 'Skipped';
      icon = 'testing-skipped-icon';
      break;
    case 'FAILURE':
      description = 'Failed';
      icon = 'error';
      break;
    case 'BLOCKED':
      description = 'Blocked';
      icon = 'stop';
      break;
    default:
    case 'READY':
      description = 'Ready';
      icon = 'loading~spin';
      break;
  }

  return {
    icon,
    description
  };
}

function* getStatuses(phases: Iterable<OperationPhase>): Iterable<Rush.OperationStatus> {
  for (const phase of phases) {
    yield phase.operationStatus.status;
  }
}
