// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import { Async, Executable, JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import { DependencyType, RushConfiguration, type CommonVersionsConfiguration } from '@microsoft/rush-lib';
import { CommandLineAction } from '@rushstack/ts-command-line';

export class BumpDecoupledLocalDependencies extends CommandLineAction {
  public constructor() {
    super({
      actionName: 'bump-decoupled-local-dependencies',
      summary: 'Updates decoupled local dependencies inside the repo.',
      documentation: ''
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
      startingFolder: process.cwd()
    });

    const cyclicDependencyNames: Set<string> = new Set<string>();

    for (const project of rushConfiguration.projects) {
      for (const cyclicDependencyProject of project.decoupledLocalDependencies) {
        cyclicDependencyNames.add(cyclicDependencyProject);
      }
    }

    const cyclicDependencyVersions: Map<string, string> = new Map<string, string>();
    await Async.forEachAsync(
      Array.from(cyclicDependencyNames),
      async (cyclicDependencyName) => {
        const version: string = await this._getLatestPublishedVersionAsync(terminal, cyclicDependencyName);
        cyclicDependencyVersions.set(cyclicDependencyName, version);
      },
      {
        concurrency: 10
      }
    );

    terminal.writeLine();

    for (const project of rushConfiguration.projects) {
      const commonVersions: CommonVersionsConfiguration = project.subspace.getCommonVersions();

      for (const cyclicDependencyProject of project.decoupledLocalDependencies) {
        const existingVersion: string | undefined =
          project.packageJson.dependencies?.[cyclicDependencyProject] ??
          project.packageJson.devDependencies?.[cyclicDependencyProject];
        if (
          existingVersion &&
          commonVersions.allowedAlternativeVersions.get(cyclicDependencyProject)?.includes(existingVersion)
        ) {
          // Skip if the existing version is allowed by common-versions.json
          continue;
        }

        const newVersion: string = cyclicDependencyVersions.get(cyclicDependencyProject)!;
        if (project.packageJsonEditor.tryGetDependency(cyclicDependencyProject)) {
          project.packageJsonEditor.addOrUpdateDependency(
            cyclicDependencyProject,
            newVersion,
            DependencyType.Regular
          );
        }

        if (project.packageJsonEditor.tryGetDevDependency(cyclicDependencyProject)) {
          project.packageJsonEditor.addOrUpdateDependency(
            cyclicDependencyProject,
            newVersion,
            DependencyType.Dev
          );
        }
      }

      if (project.packageJsonEditor.saveIfModified()) {
        terminal.writeLine(`Updated ${project.packageName}`);
      }
    }

    terminal.writeLine();

    // Update the Rush version in rush.json
    const latestRushVersion: string = await this._getLatestPublishedVersionAsync(terminal, '@microsoft/rush');
    const rushJson: { rushVersion: string } = await JsonFile.loadAsync(rushConfiguration.rushJsonFile);
    rushJson.rushVersion = latestRushVersion;
    await JsonFile.saveAsync(rushJson, rushConfiguration.rushJsonFile, { updateExistingFile: true });
    terminal.writeLine(`Updated ${rushConfiguration.rushJsonFile}`);
  }

  private async _getLatestPublishedVersionAsync(terminal: Terminal, packageName: string): Promise<string> {
    return await new Promise((resolve: (result: string) => void, reject: (error: Error) => void) => {
      const childProcess: ChildProcess = Executable.spawn('npm', ['view', packageName, 'version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const stdoutBuffer: string[] = [];
      childProcess.stdout!.on('data', (chunk) => stdoutBuffer.push(chunk));
      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (exitCode) {
          reject(new Error(`Exited with ${exitCode}`));
        } else if (signal) {
          reject(new Error(`Terminated by ${signal}`));
        } else {
          const version: string = stdoutBuffer.join('').trim();
          terminal.writeLine(`Found version "${version}" for "${packageName}"`);
          resolve(version);
        }
      });
    });
  }
}
