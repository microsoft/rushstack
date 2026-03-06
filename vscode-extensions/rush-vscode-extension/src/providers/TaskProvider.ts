// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { terminal } from '../logic/logger.ts';

let rushTaskProvider: RushTaskProvider | undefined;

export type IRushTaskDefinition = IProjectScriptTaskDefinition | IRushCommandLineTaskDefinition;

export interface IProjectScriptTaskDefinition extends vscode.TaskDefinition {
  type: 'rush-project-script';

  cwd: string;
  command: string;
  displayName: string;
}

export interface IRushCommandLineTaskDefinition extends vscode.TaskDefinition {
  type: 'rush-command-line';

  cwd: string;
  command: string;
  displayName: string;
  args: string[];
}

export class RushTaskProvider implements vscode.TaskProvider {
  private constructor() {}

  public static getInstance(): RushTaskProvider {
    if (!rushTaskProvider) {
      rushTaskProvider = new RushTaskProvider();
    }

    return rushTaskProvider;
  }

  public provideTasks(token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
    return null;
  }

  public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
    terminal.writeDebugLine(`resolveTask: ${task.definition.type}`);
    return task;
  }

  public async executeTaskAsync<T extends IRushTaskDefinition>(definition: T): Promise<void> {
    let task: vscode.Task | undefined;
    // problem matchers are defined in extension manifest
    const problemMatchers: string[] = ['$rushstack-file-error-unix', '$rushstack-file-error-visualstudio'];
    switch (definition.type) {
      case 'rush-project-script': {
        const { cwd, displayName, command } = definition;
        const taskDefinition: vscode.TaskDefinition = {
          ...definition,
          type: 'rushx',
          cwd
        };
        task = new vscode.Task(
          taskDefinition,
          vscode.TaskScope.Workspace,
          displayName,
          'rushx',
          new vscode.ShellExecution(`rushx ${command}`, {
            cwd
          }),
          problemMatchers
        );
        break;
      }
      case 'rush-command-line': {
        const { cwd, displayName, command, args } = definition;
        const taskDefinition: vscode.TaskDefinition = {
          ...definition,
          type: 'rush',
          cwd
        };
        task = new vscode.Task(
          taskDefinition,
          vscode.TaskScope.Workspace,
          displayName,
          'rush',
          new vscode.ShellExecution(`rush ${command} ${args.join(' ')}`, {
            cwd
          }),
          problemMatchers
        );
        break;
      }
      default: {
        const _def: never = definition;
        terminal.writeLine(`Unknown executeTask: ${(_def as unknown as { type: string }).type}`);
      }
    }
    if (task) {
      await vscode.tasks.executeTask(task);
    }
  }
}
