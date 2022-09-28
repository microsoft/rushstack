import * as vscode from 'vscode';
import type * as Rush from '@rushstack/rush-sdk';
import * as path from 'path';

export type StateGroupName = 'Active' | 'Included' | 'Available';

export interface IProjectDataProviderParams {
  workspaceRoot: string;
  extensionContext: vscode.ExtensionContext;
  rush: typeof Rush;
}

interface IStatusAndActive {
  status: Rush.OperationStatus;
  active: boolean;
}

export class ProjectDataProvider
  implements
    vscode.TreeDataProvider<StateGroup | Project | OperationPhase | Message>,
    vscode.FileDecorationProvider
{
  private _workspaceRoot: string;
  private _onDidChangeTreeData: vscode.EventEmitter<
    StateGroup | Project | OperationPhase | (StateGroup | Project | OperationPhase)[] | undefined
  >;
  private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>;

  private _stateGroups: StateGroup[];

  private _activeGroup: StateGroup;
  private _includedGroup: StateGroup;
  private _availableGroup: StateGroup;
  private _rush: typeof Rush;

  private _projectsByName: Map<string, Project>;
  private _extensionContext: vscode.ExtensionContext;

  private _lookup: Rush.LookupByPath<Project>;

  constructor(params: IProjectDataProviderParams) {
    const { workspaceRoot, rush, extensionContext } = params;

    this._workspaceRoot = workspaceRoot;
    this._rush = rush;
    this._extensionContext = extensionContext;

    this._onDidChangeTreeData = new vscode.EventEmitter();
    this._onDidChangeFileDecorations = new vscode.EventEmitter();

    this._activeGroup = new StateGroup('Active');
    this._includedGroup = new StateGroup('Included');
    this._availableGroup = new StateGroup('Available');

    this._projectsByName = new Map<string, Project>();
    this._lookup = new rush.LookupByPath();

    this._stateGroups = [this._activeGroup, this._includedGroup, this._availableGroup];
  }

  public async refresh(): Promise<void> {
    this._activeGroup.projects.clear();
    this._includedGroup.projects.clear();
    this._availableGroup.projects.clear();
    this._projectsByName.clear();

    await Promise.all([
      vscode.commands.executeCommand('setContext', 'rush.activeProjects.count', 0),
      vscode.commands.executeCommand('setContext', 'rush.includedProjects.count', 0),
      vscode.commands.executeCommand('setContext', 'rush.availableProjects.count', 0)
    ]);

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire([this._activeGroup, this._includedGroup, this._availableGroup]);
    console.log('Updated tree data', 3, Date.now());

    if (!this._rush.RushConfiguration) {
      return;
    }

    const rushConfigurationFile = this._rush.RushConfiguration.tryFindRushJsonLocation({
      startingFolder: this._workspaceRoot
    });

    if (!rushConfigurationFile) {
      return;
    }

    const rushConfiguration = this._rush.RushConfiguration.loadFromConfigurationFile(rushConfigurationFile);

    if (!rushConfiguration) {
      return;
    }

    this._lookup = new this._rush.LookupByPath(undefined, path.sep);

    vscode.commands.executeCommand('setContext', 'rush.enabled', true);

    for (const rushProject of rushConfiguration.projects) {
      const project = new Project(rushProject);

      this._projectsByName.set(rushProject.packageName, project);
      this._availableGroup.projects.add(project);

      this._lookup.setItem(vscode.Uri.file(rushProject.projectFolder).fsPath, project);
    }

    await Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'rush.activeProjects.count',
        this._activeGroup.projects.size
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.includedProjects.count',
        this._includedGroup.projects.size
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.availableProjects.count',
        this._availableGroup.projects.size
      )
    ]);

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
      this._onDidChangeFileDecorations.fire(undefined);
    } else {
      this._onDidChangeTreeData.fire(Array.from(updatedProjects));

      const resourceUris: vscode.Uri[] = [];

      for (const project of updatedProjects) {
        resourceUris.push(vscode.Uri.file(path.join(project.rushProject.projectFolder, 'package.json')));
      }

      this._onDidChangeFileDecorations.fire(resourceUris);
    }
    console.log('Updated tree data', updatedProjects.size, Date.now());

    console.log('Updated project phases', operationStatuses.length, Date.now());
  }

  public getProjectForResource(resource: vscode.Uri): Project | undefined {
    return this._lookup.findChildPath(resource.fsPath);
  }

  public async toggleActiveProjects(toggleProjects: Project[], force?: boolean): Promise<void> {
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

    await Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'rush.activeProjects.count',
        this._activeGroup.projects.size
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.includedProjects.count',
        this._includedGroup.projects.size
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.availableProjects.count',
        this._availableGroup.projects.size
      )
    ]);

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

  public get onDidChangeFileDecorations(): vscode.Event<vscode.Uri | vscode.Uri[] | undefined> {
    return this._onDidChangeFileDecorations.event;
  }

  public provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme !== 'rush') {
      return undefined;
    }

    const projectName = `${uri.authority}${uri.path}`;

    const project = this._projectsByName.get(projectName);

    if (project) {
      const { status, active } = getOverallStatus(project.phases.values());

      const { badge, color } = getStatusIndicators(status, active);

      return new vscode.FileDecoration(badge, undefined, new vscode.ThemeColor(color));
    }

    return undefined;
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
      treeItem.resourceUri = vscode.Uri.parse(`rush://${element.rushProject.packageName}`, true);
      treeItem.tooltip = element.rushProject.packageJson.description;

      const status = getOverallStatus(element.phases.values());

      const { icon, description, color } = getStatusIndicators(status.status, status.active);

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

      const { icon, description, color } = getStatusIndicators(
        element.operationStatus.status,
        element.operationStatus.active
      );

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

function getOverallStatus(statuses: Iterable<OperationPhase>): IStatusAndActive {
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

  let isActive: boolean = false;

  for (const {
    operationStatus: { status, active }
  } of statuses) {
    histogram[status]++;
    if (active) {
      isActive = true;
    }
  }

  return {
    status: mergeStatus(histogram),
    active: isActive
  };
}

function mergeStatus(histogram: { [P in Rush.OperationStatus]: number }): Rush.OperationStatus {
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

function getStatusIndicators(
  status: Rush.OperationStatus,
  active: boolean
): {
  icon: string;
  description: string;
  color: string;
  badge: string | undefined;
} {
  let icon: string;
  let description: string;
  let color: string;
  let badge: string | undefined;

  if (!active) {
    return {
      description: 'Out of scope',
      icon: 'circle-outline',
      color: 'disabledForeground',
      badge: undefined
    };
  }

  switch (status) {
    case 'SUCCESS':
      description = 'Succeeded';
      icon = 'pass';
      color = 'testing.iconPassed';
      badge = 'S';
      break;
    case 'FROM CACHE':
      description = 'Succeeded (from cache)';
      icon = 'pass';
      color = 'testing.iconPassed';
      badge = 'SC';
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
      badge = 'E';
      break;
    case 'SUCCESS WITH WARNINGS':
      description = 'Succeeded with warnings';
      icon = 'warning';
      color = 'testing.iconFailed';
      badge = 'SW';
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
      badge = 'F';
      break;
    case 'BLOCKED':
      description = 'Blocked';
      icon = 'stop';
      color = 'testing.iconQueued';
      badge = 'B';
      break;
    default:
    case 'READY':
      description = 'Pending';
      icon = 'clock';
      color = 'notebookStatusRunningIcon.foreground';
      badge = 'P';
      break;
  }

  return {
    icon,
    description,
    color,
    badge
  };
}
