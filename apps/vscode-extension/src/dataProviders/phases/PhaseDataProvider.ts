import * as vscode from 'vscode';

import type * as Rush from '@rushstack/rush-sdk';

export type StateGroupName = 'Active' | 'Included' | 'Available';

export interface IPhaseDataProviderParams {
  workspaceRoot: string;
  extensionContext: vscode.ExtensionContext;
  rush: typeof Rush;
}

export class PhaseDataProvider implements vscode.TreeDataProvider<PhaseStateGroup | Phase | Message> {
  private _workspaceRoot: string;
  private _onDidChangeTreeData: vscode.EventEmitter<
    PhaseStateGroup | Phase | (PhaseStateGroup | Phase)[] | undefined
  >;

  private _stateGroups: PhaseStateGroup[];
  private _groupByState: Record<StateGroupName, PhaseStateGroup>;
  private _rush: typeof Rush;

  private _phasesByName: Map<string, Phase>;
  private _extensionContext: vscode.ExtensionContext;

  constructor(params: IPhaseDataProviderParams) {
    const { workspaceRoot, rush, extensionContext } = params;

    this._workspaceRoot = workspaceRoot;
    this._rush = rush;
    this._extensionContext = extensionContext;

    this._onDidChangeTreeData = new vscode.EventEmitter();

    const groupByState: Record<StateGroupName, PhaseStateGroup> = {
      Active: new PhaseStateGroup('Active', [
        new Message('To get started, activate phases from this repository.')
      ]),
      Included: new PhaseStateGroup('Included', [
        new Message('Dependencies of active phases will appear here.')
      ]),
      Available: new PhaseStateGroup('Available', [])
    };

    this._phasesByName = new Map<string, Phase>();
    this._groupByState = groupByState;

    this._stateGroups = Object.values(groupByState);
  }

  public async refresh(): Promise<void> {
    this._phasesByName.clear();

    await Promise.all([
      vscode.commands.executeCommand('setContext', 'rush.activePhases.count', 0),
      vscode.commands.executeCommand('setContext', 'rush.includedPhases.count', 0),
      vscode.commands.executeCommand('setContext', 'rush.availablePhases.count', 0)
    ]);

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire(this._stateGroups);
    console.log('Updated tree data', 3, Date.now());

    if (!this._rush.RushCommandLineParser) {
      return;
    }

    const commandLineParser = new this._rush.RushCommandLineParser({
      cwd: this._workspaceRoot,
      excludeDefaultActions: true
    });

    const command = commandLineParser.tryGetAction('start') as
      | { _knownPhases: ReadonlyMap<string, Rush.IPhase> }
      | undefined;
    if (!command) {
      console.warn(`This repository does not define an action named 'start'`);
      return;
    }

    const phaseByRushPhase = new Map();
    const sortedPhases: Phase[] = Array.from(command._knownPhases.values(), (rushPhase: Rush.IPhase) => {
      const phase = new Phase(rushPhase);
      phaseByRushPhase.set(rushPhase, phase);
      return phase;
    });

    sortedPhases.sort(phaseNameSort);

    for (const phase of sortedPhases) {
      for (const dependency of phase.rushPhase.dependencies.self) {
        const dependencyPhase = phaseByRushPhase.get(dependency);
        if (dependencyPhase) {
          phase.dependencies.add(dependencyPhase);
        }
      }
      this._phasesByName.set(phase.rushPhase.name, phase);
    }

    const activePhases: Phase[] = [];

    const activePhasesState =
      this._extensionContext.workspaceState.get<{ [key: string]: true }>('rush.activePhases');

    if (activePhasesState) {
      for (const projectName of Object.keys(activePhasesState)) {
        const phase = this._phasesByName.get(projectName);

        if (phase) {
          activePhases.push(phase);
        }
      }
    }

    await this.toggleActivePhases(activePhases, true);
  }

  public getPhasesByState(state: StateGroupName): ReadonlyArray<Phase> {
    return this._groupByState[state].children;
  }

  public async toggleActivePhases(togglePhases: Phase[], force?: boolean): Promise<void> {
    console.log('Toggling active phases', togglePhases.length, Date.now());

    if (togglePhases.length === 0) {
      return;
    }

    const destinationStateGroup =
      force ?? togglePhases[0].stateGroupName !== 'Active' ? 'Active' : 'Available';
    for (const phase of togglePhases) {
      phase.stateGroupName = destinationStateGroup;
    }

    const activePhasesState: {
      [key: string]: true;
    } = {};

    const queue: Set<Phase> = new Set();
    for (const phase of this._phasesByName.values()) {
      if (phase.stateGroupName === 'Active') {
        queue.add(phase);
        activePhasesState[phase.rushPhase.name] = true;
      } else if (phase.stateGroupName === 'Included') {
        phase.stateGroupName = 'Available';
      }
    }

    this._extensionContext.workspaceState.update('rush.activePhases', activePhasesState);

    for (const phase of queue) {
      if (phase.stateGroupName === 'Available') {
        phase.stateGroupName = 'Included';
      }

      for (const dependency of phase.dependencies) {
        queue.add(dependency);
      }
    }

    const groupByState = this._groupByState;
    for (const group of this._stateGroups) {
      group.children.length = 0;
    }

    for (const phase of this._phasesByName.values()) {
      groupByState[phase.stateGroupName].children.push(phase);
    }

    await Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'rush.activePhases.count',
        groupByState.Active.children.length
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.includedPhases.count',
        groupByState.Included.children.length
      ),
      vscode.commands.executeCommand(
        'setContext',
        'rush.availablePhases.count',
        groupByState.Available.children.length
      )
    ]);

    console.log('Updating tree data', 3, Date.now());
    this._onDidChangeTreeData.fire(this._stateGroups);
    console.log('Updated tree data', 3, Date.now());

    console.log('Toggled active phases', togglePhases.length, Date.now());
  }

  public get onDidChangeTreeData(): vscode.Event<
    PhaseStateGroup | Phase | (PhaseStateGroup | Phase)[] | undefined
  > {
    return this._onDidChangeTreeData.event;
  }

  public getChildren(element?: PhaseStateGroup | Phase | undefined): (PhaseStateGroup | Phase | Message)[] {
    if (!element) {
      return this._stateGroups;
    } else if (element instanceof PhaseStateGroup) {
      const children: Phase[] = element.children;

      if (children.length === 0) {
        return element.defaultChildren;
      }

      return children;
    }

    return [];
  }

  public getParent(element: Phase): vscode.ProviderResult<Phase> {
    return undefined;
  }

  public getTreeItem(element: Phase | PhaseStateGroup | Message): vscode.TreeItem {
    return element.renderTreeItem();
  }
}

export class Phase {
  public readonly rushPhase: Rush.IPhase;
  public readonly dependencies: Set<Phase>;

  public stateGroupName: StateGroupName;

  constructor(rushPhase: Rush.IPhase) {
    this.rushPhase = rushPhase;
    this.dependencies = new Set();

    this.stateGroupName = 'Available';
  }

  public renderTreeItem(): vscode.TreeItem {
    const phaseName: string = this.rushPhase.name.replace(/^_phase:/, '');
    const treeItem = new vscode.TreeItem(phaseName, vscode.TreeItemCollapsibleState.None);

    treeItem.contextValue = `phase:${this.stateGroupName}`;

    treeItem.id = `phase:${phaseName}`;

    return treeItem;
  }
}

export class PhaseStateGroup {
  public readonly groupName: StateGroupName;
  public readonly defaultChildren: Message[];
  public readonly children: Phase[];

  constructor(groupName: StateGroupName, defaultChildren: Message[]) {
    this.groupName = groupName;
    this.defaultChildren = defaultChildren;
    this.children = [];
  }

  public renderTreeItem(): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(this.groupName, vscode.TreeItemCollapsibleState.Expanded);

    treeItem.contextValue = `group:${this.groupName}`;

    treeItem.id = `group:${this.groupName}`;

    return treeItem;
  }
}

export class Message {
  public readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  public renderTreeItem(): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.None);

    treeItem.id = `message:${this.label}`;

    return treeItem;
  }
}

function phaseNameSort(a: Phase, b: Phase): number {
  return a.rushPhase.name.localeCompare(b.rushPhase.name);
}
