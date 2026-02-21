// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { JsonFile, type JsonObject } from '@rushstack/node-core-library';
import { RushTaskProvider } from './TaskProvider.ts';
import { terminal } from '../logic/logger.ts';
import { RushWorkspace } from '../logic/RushWorkspace.ts';

import type { RushConfiguration, RushConfigurationProject } from '@rushstack/rush-sdk';
import { RushCommandWebViewPanel } from '../logic/RushCommandWebViewPanel.ts';

interface IRushProjectParams {
  label: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  rushConfigurationProject: RushConfigurationProject;
}

class RushProject extends vscode.TreeItem {
  public readonly rushConfigurationProject: RushConfigurationProject;
  public constructor({ label, rushConfigurationProject, collapsibleState }: IRushProjectParams) {
    super(label, collapsibleState);
    this.rushConfigurationProject = rushConfigurationProject;
    this.contextValue = 'project';

    // this.tooltip = '';
    // this.description = '';
  }
}

interface IRushProjectScriptParams {
  label: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  projectFolder: string;
  projectRelativeFolder: string;
  scriptName: string;
  scriptValue: string;
}

class RushProjectScript extends vscode.TreeItem {
  public readonly projectFolder: string;
  public readonly projectRelativeFolder: string;
  public readonly scriptName: string;
  public readonly scriptValue: string;
  public constructor({
    label,
    collapsibleState,
    projectFolder,
    projectRelativeFolder,
    scriptName,
    scriptValue
  }: IRushProjectScriptParams) {
    super(label, collapsibleState);
    this.contextValue = 'projectScript';

    this.projectFolder = projectFolder;
    this.projectRelativeFolder = projectRelativeFolder;
    this.scriptName = scriptName;
    this.scriptValue = scriptValue;

    // this.tooltip = '';
    this.description = 'test description';
  }
}

type RushProjectsTreeItem = RushProject | RushProjectScript;

export class RushProjectsProvider implements vscode.TreeDataProvider<RushProjectsTreeItem> {
  private _rushConfiguration: RushConfiguration | undefined;
  private readonly _onDidChangeTreeData: vscode.EventEmitter<RushProjectsTreeItem | undefined> =
    new vscode.EventEmitter();

  public readonly onDidChangeTreeData: vscode.Event<RushProjectsTreeItem | undefined> =
    this._onDidChangeTreeData.event;

  public constructor(context: vscode.ExtensionContext) {
    const rushWorkspace: RushWorkspace = RushWorkspace.getCurrentInstance();
    RushWorkspace.onDidChangeWorkspace((newWorkspace: RushWorkspace) => {
      this._rushConfiguration = newWorkspace.rushConfiguration;
      this.refresh();
    });
    this._rushConfiguration = rushWorkspace.rushConfiguration;

    const commandNames: readonly ['revealInExplorer', 'revealProjectDetail', 'runProjectScript'] = [
      'revealInExplorer',
      'revealProjectDetail',
      'runProjectScript'
    ] as const;

    for (const commandName of commandNames) {
      const handler:
        | ((element: RushProject) => Promise<void>)
        | ((element: RushProjectScript) => Promise<void>) = this[`${commandName}Async`];
      context.subscriptions.push(
        vscode.commands.registerCommand(`rushstack.rushProjects.${commandName}`, handler, this)
      );
    }
  }

  public refresh(): void {
    terminal.writeDebugLine('Refreshing Rush projects');
    this._onDidChangeTreeData.fire(undefined);
  }

  public async refreshEntryAsync(): Promise<void> {
    this.refresh();
  }

  public async revealInExplorerAsync(element: RushProject): Promise<void> {
    const projectFolder: string = element.rushConfigurationProject.projectFolder;
    if (projectFolder) {
      terminal.writeDebugLine(`Revealing ${projectFolder} in explorer`);
      return await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(projectFolder));
    }
  }

  public async revealProjectDetailAsync(element: RushProject): Promise<void> {
    const { rushConfigurationProject } = element;
    // eslint-disable-next-line no-console
    console.log('Explorer clicked: ', rushConfigurationProject.packageName);
    RushCommandWebViewPanel.getInstance().postMessage({
      command: 'updateProject',
      state: {
        projectName: rushConfigurationProject.packageName,
        projectVersion: rushConfigurationProject.packageJson.version,
        dependencies: rushConfigurationProject.packageJson.dependencies,
        devDependencies: rushConfigurationProject.packageJson.devDependencies
      }
    });
  }

  public async runProjectScriptAsync(element: RushProjectScript): Promise<void> {
    if (element.projectFolder) {
      const { projectFolder, projectRelativeFolder, scriptName } = element;
      await RushTaskProvider.getInstance().executeTaskAsync({
        type: 'rush-project-script',
        cwd: projectFolder,
        displayName: `${scriptName} - ${projectRelativeFolder}`,
        command: scriptName
      });
    }
  }

  public getTreeItem(element: RushProject | RushProjectScript): vscode.TreeItem {
    return element;
  }

  public getChildren(
    element?: RushProject | RushProjectScript
  ): Thenable<RushProject[] | RushProjectScript[]> {
    if (!this._rushConfiguration) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      vscode.window.showInformationMessage('No RushProjects in empty workspace');
      return Promise.resolve([]);
    }

    // top-level
    if (!element) {
      const rushProjectTreeItems: RushProject[] = this._rushConfiguration.projects.map(
        (project: RushConfigurationProject) =>
          new RushProject({
            label: project.packageName,
            rushConfigurationProject: project,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
          })
      );
      return Promise.resolve(rushProjectTreeItems);
    }

    if (element instanceof RushProject) {
      try {
        const projectFolder: string = element.rushConfigurationProject.projectFolder;
        const projectRelativeFolder: string = element.rushConfigurationProject.projectRelativeFolder;
        const packageJson: JsonObject = JsonFile.load(path.join(projectFolder, 'package.json'));
        const rushProjectScriptTreeItems: RushProjectScript[] = Object.keys(packageJson.scripts).map(
          (scriptName) =>
            new RushProjectScript({
              label: scriptName,
              collapsibleState: vscode.TreeItemCollapsibleState.None,
              projectFolder,
              projectRelativeFolder,
              scriptName,
              scriptValue: packageJson.scripts[scriptName]
            })
        );
        return Promise.resolve(rushProjectScriptTreeItems);
      } catch {
        return Promise.resolve([]);
      }
    }

    return Promise.resolve([]);
  }
}
