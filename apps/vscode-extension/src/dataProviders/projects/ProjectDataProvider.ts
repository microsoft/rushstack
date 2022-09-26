import * as vscode from 'vscode';
import type * as Rush from '@rushstack/rush-sdk';
import * as path from 'path';

export type StateGroupName = 'Active' | 'Included' | 'Available';

export interface IProjectDataProviderParams {
  workspaceRoot: string | undefined;
  extensionContext: vscode.ExtensionContext;
  loadRush: () => Promise<typeof Rush>;
}

export class ProjectDataProvider
  implements vscode.TreeDataProvider<StateGroup | Project | OperationPhase | Message>
{
  private _workspaceRoot: string | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<
    StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
  >;

  private _stateGroups: StateGroup[];

  private _activeGroup: StateGroup;
  private _includedGroup: StateGroup;
  private _availableGroup: StateGroup;
  private _loadRush: () => Promise<typeof Rush>;

  private _projectsByName: Map<string, Project>;
  private _extensionContext: vscode.ExtensionContext;

  constructor(params: IProjectDataProviderParams) {
    const { workspaceRoot, loadRush, extensionContext } = params;

    this._workspaceRoot = workspaceRoot;
    this._loadRush = loadRush;
    this._extensionContext = extensionContext;

    this._onDidChangeTreeData = new vscode.EventEmitter<
      StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
    >();

    this._activeGroup = new StateGroup('Active');
    this._includedGroup = new StateGroup('Included');
    this._availableGroup = new StateGroup('Available');

    this._projectsByName = new Map<string, Project>();

    this.refresh();

    this._stateGroups = [this._activeGroup, this._includedGroup, this._availableGroup];
  }

  public async refresh(): Promise<void> {
    const workspaceRoot = this._workspaceRoot;

    this._activeGroup.projects.clear();
    this._includedGroup.projects.clear();
    this._availableGroup.projects.clear();
    this._projectsByName.clear();

    vscode.commands.executeCommand('setContext', 'rush.activeProjects.count', 0);
    vscode.commands.executeCommand('setContext', 'rush.includedProjects.count', 0);
    vscode.commands.executeCommand('setContext', 'rush.availableProjects.count', 0);

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._availableGroup]);
    console.log('Updated tree data', 3, Date.now());

    if (!workspaceRoot) {
      return;
    }

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

    if (!rushConfiguration) {
      return;
    }

    vscode.commands.executeCommand('setContext', 'rush.enabled', true);

    for (const rushProject of rushConfiguration.projects) {
      const project = new Project(rushProject);

      this._projectsByName.set(rushProject.packageName, project);
      this._availableGroup.projects.add(project);
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
      'rush.availableProjects.count',
      this._availableGroup.projects.size
    );

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._availableGroup]);
    console.log('Updated tree data', 3, Date.now());

    const activeProjectsState =
      this._extensionContext.workspaceState.get<{ [key: string]: true }>('rush.activeProjects');

    if (activeProjectsState) {
      const activeProjects: Project[] = [];

      for (const projectName of Object.keys(activeProjectsState)) {
        const project = this._projectsByName.get(projectName);

        if (project) {
          activeProjects.push(project);
        }
      }

      this.toggleActiveProjects(activeProjects, true);
    }
  }

  public getActiveProjects(): Project[] {
    return Array.from(this._activeGroup.projects);
  }

  public getIncludedProjects(): Project[] {
    return Array.from(this._includedGroup.projects);
  }

  public updateProjectPhases(operationStatuses: Rush.ITransferableOperationStatus[]): void {
    console.log('Updating project phases', operationStatuses.length, Date.now());

    const updatedProjects = new Set<Project>();

    for (const operationStatus of operationStatuses) {
      const {
        operation: { project: projectName, phase }
      } = operationStatus;

      if (!projectName || !phase) {
        continue;
      }

      const project = this._projectsByName.get(projectName);

      if (!project) {
        continue;
      }

      let operationPhase = project.phases.get(phase);

      if (!operationPhase) {
        operationPhase = new OperationPhase(project.rushProject, operationStatus);
        project.phases.set(phase, operationPhase);
      }

      operationPhase.operationStatus = operationStatus;

      updatedProjects.add(project);
    }

    console.log('Updating tree data', updatedProjects.size, Date.now());
    if (updatedProjects.size > 10) {
      this._onDidChangeTreeData.fire(undefined);
    } else {
      this._onDidChangeTreeData.fire(Array.from(updatedProjects));
    }
    console.log('Updated tree data', updatedProjects.size, Date.now());

    console.log('Updated project phases', operationStatuses.length, Date.now());
  }

  public getProjectForResource(resource: vscode.Uri): Project | undefined {
    return undefined;
  }

  public toggleActiveProjects(toggleProjects: Project[], force?: boolean): void {
    console.log('Toggling active projects', toggleProjects.length, Date.now());

    if (toggleProjects.length === 0) {
      return;
    }

    this._availableGroup.projects.clear();

    for (const project of this._projectsByName.values()) {
      project.stateGroupName = 'Available';
      this._availableGroup.projects.add(project);
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

    const activeProjectsState: {
      [key: string]: true;
    } = {};

    for (const activeProject of this._activeGroup.projects) {
      activeProject.stateGroupName = 'Active';
      seenProjects.add(activeProject.rushProject.packageName);
      this._availableGroup.projects.delete(activeProject);
      queue.push(activeProject);
      activeProjectsState[activeProject.rushProject.packageName] = true;
    }

    this._extensionContext.workspaceState.update('rush.activeProjects', activeProjectsState);

    this._includedGroup.projects.clear();

    let included: Project | undefined;

    while ((included = queue.shift())) {
      for (const dependency of included.rushProject.dependencyProjects) {
        if (!seenProjects.has(dependency.packageName)) {
          const dependencyProject = this._projectsByName.get(dependency.packageName);

          if (dependencyProject) {
            dependencyProject.stateGroupName = 'Included';
            this._includedGroup.projects.add(dependencyProject);
            this._availableGroup.projects.delete(dependencyProject);
            queue.push(dependencyProject);
          }

          seenProjects.add(dependency.packageName);
        }
      }
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
      'rush.availableProjects.count',
      this._availableGroup.projects.size
    );

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._availableGroup]);
    console.log('Updated tree data', 3, Date.now());

    console.log('Toggled active projects', toggleProjects.length, Date.now());
  }

  public get onDidChangeTreeData(): vscode.Event<
    StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
  > {
    return this._onDidChangeTreeData.event;
  }

  public getChildren(
    element?: StateGroup | Project | OperationPhase | undefined
  ): (StateGroup | Project | OperationPhase | Message)[] {
    if (!element) {
      return this._stateGroups;
    } else if (element instanceof StateGroup) {
      if (element.groupName === 'Active') {
        if (this._activeGroup.projects.size === 0) {
          return [new Message('To get started, activate projects from this repository.')];
        }

        return Array.from(this._activeGroup.projects).sort((a: Project, b: Project) =>
          a.rushProject.packageName.localeCompare(b.rushProject.packageName)
        );
      } else if (element.groupName === 'Included') {
        if (this._includedGroup.projects.size === 0) {
          return [new Message('Dependencies of active projects will appear here.')];
        }
        return Array.from(this._includedGroup.projects).sort((a: Project, b: Project) =>
          a.rushProject.packageName.localeCompare(b.rushProject.packageName)
        );
      } else if (element.groupName === 'Available') {
        return Array.from(this._availableGroup.projects).sort((a: Project, b: Project) =>
          a.rushProject.packageName.localeCompare(b.rushProject.packageName)
        );
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

      treeItem.id = `message:${element.label}`;

      return treeItem;
    } else if (element instanceof Project) {
      const treeItem = new vscode.TreeItem(
        element.rushProject.packageName,
        element.phases.size > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );

      treeItem.contextValue = `project:${element.stateGroupName}`;
      treeItem.resourceUri = vscode.Uri.file(path.join(element.rushProject.projectFolder, 'package.json'));
      treeItem.tooltip = element.rushProject.packageJson.description;

      const status = getOverallStatus(getStatuses(element.phases.values()));

      const { icon, description, color } = getStatusIndicators(status);

      treeItem.description = description;
      treeItem.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));

      treeItem.id = `project:${element.rushProject.packageName}`;

      return treeItem;
    } else if (element instanceof OperationPhase) {
      const treeItem = new vscode.TreeItem(
        element.operationStatus.operation.phase!,
        vscode.TreeItemCollapsibleState.None
      );

      treeItem.id = `phase:${element.rushProject.packageName};_${element.operationStatus.operation.phase!}`;

      const { icon, description, color } = getStatusIndicators(element.operationStatus.status);

      treeItem.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
      treeItem.description = description;
      treeItem.tooltip = `${element.operationStatus.hash}`;
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

    this.stateGroupName = 'Available';

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
  color: string;
} {
  let icon: string;
  let description: string;
  let color: string;

  switch (status) {
    case 'SUCCESS':
      description = 'Succeeded';
      icon = 'pass';
      color = 'testing.iconPassed';
      break;
    case 'FROM CACHE':
      description = 'Succeeded (from cache)';
      icon = 'pass';
      color = 'testing.iconPassed';
      break;
    case 'NO OP':
      description = 'Not configured';
      icon = 'circle-outline';
      color = 'disabledForeground';
      break;
    case 'EXECUTING':
      description = 'Executing';
      icon = 'sync~spin';
      color = 'notebookStatusRunningIcon.foreground';
      break;
    case 'SUCCESS WITH WARNINGS':
      description = 'Succeeded with warnings';
      icon = 'warning';
      color = 'testing.iconFailed';
      break;
    case 'SKIPPED':
      description = 'Skipped';
      icon = 'testing-skipped-icon';
      color = 'testing.iconSkipped';
      break;
    case 'FAILURE':
      description = 'Failed';
      icon = 'error';
      color = 'testing.iconFailed';
      break;
    case 'BLOCKED':
      description = 'Blocked';
      icon = 'stop';
      color = 'disabledForeground';
      break;
    default:
    case 'READY':
      description = 'Pending';
      icon = 'clock';
      color = 'notebookStatusRunningIcon.foreground';
      break;
  }

  return {
    icon,
    description,
    color
  };
}

function* getStatuses(phases: Iterable<OperationPhase>): Iterable<Rush.OperationStatus> {
  for (const phase of phases) {
    yield phase.operationStatus.status;
  }
}
