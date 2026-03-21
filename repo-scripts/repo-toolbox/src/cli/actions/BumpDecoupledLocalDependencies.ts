// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import { Async, Executable, JsonFile } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { DependencyType, RushConfiguration } from '@microsoft/rush-lib';
import type { IRushConfigurationJson } from '@microsoft/rush-lib/lib/api/RushConfiguration';
import { CommandLineAction } from '@rushstack/ts-command-line';

async function _getLatestPublishedVersionAsync(terminal: ITerminal, packageName: string): Promise<string> {
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

export class BumpDecoupledLocalDependencies extends CommandLineAction {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'bump-decoupled-local-dependencies',
      summary: 'Updates decoupled local dependencies inside the repo.',
      documentation: ''
    });

    this._terminal = terminal;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const { projects, rushJsonFile } = RushConfiguration.loadFromDefaultLocation({
      startingFolder: process.cwd()
    });

    const cyclicDependencyNames: Set<string> = new Set<string>();

    for (const { decoupledLocalDependencies } of projects) {
      for (const decoupledLocalDependency of decoupledLocalDependencies) {
        cyclicDependencyNames.add(decoupledLocalDependency);
      }
    }

    const decoupledLocalDependencyVersionsByName: Map<string, string> = new Map<string, string>();
    await Async.forEachAsync(
      Array.from(cyclicDependencyNames),
      async (decoupledLocalDependencyName) => {
        const version: string = await _getLatestPublishedVersionAsync(terminal, decoupledLocalDependencyName);
        decoupledLocalDependencyVersionsByName.set(decoupledLocalDependencyName, version);
      },
      {
        concurrency: 10
      }
    );

    terminal.writeLine();

    for (const {
      packageName,
      decoupledLocalDependencies,
      subspace,
      packageJson: { dependencies, devDependencies },
      packageJsonEditor
    } of projects) {
      const { allowedAlternativeVersions } = subspace.getCommonVersions();

      for (const cyclicDependencyProject of decoupledLocalDependencies) {
        const existingVersion: string | undefined =
          dependencies?.[cyclicDependencyProject] ?? devDependencies?.[cyclicDependencyProject];
        if (
          existingVersion &&
          allowedAlternativeVersions.get(cyclicDependencyProject)?.includes(existingVersion)
        ) {
          // Skip if the existing version is allowed by common-versions.json
          continue;
        }

        const newVersion: string = decoupledLocalDependencyVersionsByName.get(cyclicDependencyProject)!;
        if (packageJsonEditor.tryGetDependency(cyclicDependencyProject)) {
          packageJsonEditor.addOrUpdateDependency(
            cyclicDependencyProject,
            newVersion,
            DependencyType.Regular
          );
        }

        if (packageJsonEditor.tryGetDevDependency(cyclicDependencyProject)) {
          packageJsonEditor.addOrUpdateDependency(cyclicDependencyProject, newVersion, DependencyType.Dev);
        }
      }

      if (packageJsonEditor.saveIfModified()) {
        terminal.writeLine(`Updated ${packageName}`);
      }
    }

    terminal.writeLine();

    // Update the Rush version in rush.json
    const latestRushVersion: string = await _getLatestPublishedVersionAsync(terminal, '@microsoft/rush');
    const rushJson: IRushConfigurationJson = await JsonFile.loadAsync(rushJsonFile);
    rushJson.rushVersion = latestRushVersion;
    await JsonFile.saveAsync(rushJson, rushJsonFile, { updateExistingFile: true });
    terminal.writeLine(`Updated ${rushJsonFile}`);
  }
}
