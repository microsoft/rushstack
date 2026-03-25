// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import {
  Async,
  Executable,
  FileSystem,
  FolderItem,
  JsonFile,
  type IPackageJson
} from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { DependencyType, PackageJsonEditor, RushConfiguration, Subspace } from '@microsoft/rush-lib';
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

interface IProjectLike {
  packageName: string;
  decoupledLocalDependencies: Iterable<string>;
  subspace: Subspace | undefined;
  packageJsonEditor: PackageJsonEditor;
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
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
      startingFolder: process.cwd()
    });
    const { projects, rushJsonFile, commonAutoinstallersFolder } = rushConfiguration;

    const projectsToUpdate: IProjectLike[] = [];

    const allDecoupledLocalDependencyNames: Set<string> = new Set();
    for (const project of projects) {
      const { decoupledLocalDependencies } = project;
      for (const decoupledLocalDependency of decoupledLocalDependencies) {
        allDecoupledLocalDependencyNames.add(decoupledLocalDependency);
      }

      projectsToUpdate.push(project);
    }

    // Collect all package names published from this repo
    const publishedPackageNames: Set<string> = new Set();
    for (const { shouldPublish, packageName } of projects) {
      // Note that shouldPublish is also true here if the project is driven by a version policy
      if (shouldPublish) {
        publishedPackageNames.add(packageName);
      }
    }

    // Scan autoinstaller package.json files for dependencies on packages published from this repo
    // Map of autoinstaller name -> { packageJsonPath, packageJson }
    const autoinstallerInfoByName: Map<string, { packageJsonPath: string; packageJson: IPackageJson }> =
      new Map();

    let autoinstallerEntries: FolderItem[] = [];
    try {
      autoinstallerEntries = await FileSystem.readFolderItemsAsync(commonAutoinstallersFolder);
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }

    await Async.forEachAsync(
      autoinstallerEntries,
      async (folderItem) => {
        if (folderItem.isDirectory()) {
          const autoinstallerName: string = folderItem.name;
          const packageJsonPath: string = `${commonAutoinstallersFolder}/${autoinstallerName}/package.json`;
          try {
            const packageJsonEditor: PackageJsonEditor = PackageJsonEditor.load(packageJsonPath);

            const { dependencyList, devDependencyList } = packageJsonEditor;
            const decoupledLocalDependencies: Set<string> = new Set();
            for (const { name } of [...dependencyList, ...devDependencyList]) {
              if (publishedPackageNames.has(name)) {
                allDecoupledLocalDependencyNames.add(name);
                decoupledLocalDependencies.add(name);
              }
            }

            projectsToUpdate.push({
              packageName: `${autoinstallerName} (autoinstaller)`,
              decoupledLocalDependencies,
              subspace: undefined,
              packageJsonEditor
            });
          } catch (error) {
            if (!FileSystem.isNotExistError(error)) {
              throw error;
            }
          }
        }
      },
      { concurrency: 10 }
    );

    const decoupledLocalDependencyVersionsByName: Map<string, string> = new Map();
    await Async.forEachAsync(
      allDecoupledLocalDependencyNames,
      async (decoupledLocalDependencyName) => {
        const version: string = await _getLatestPublishedVersionAsync(terminal, decoupledLocalDependencyName);
        decoupledLocalDependencyVersionsByName.set(decoupledLocalDependencyName, version);
      },
      {
        concurrency: 10
      }
    );

    terminal.writeLine();

    for (const { packageName, decoupledLocalDependencies, subspace, packageJsonEditor } of projectsToUpdate) {
      const { allowedAlternativeVersions } = subspace?.getCommonVersions() ?? {};

      for (const cyclicDependencyProject of decoupledLocalDependencies) {
        const { version: existingVersion } =
          packageJsonEditor.tryGetDependency(cyclicDependencyProject) ??
          packageJsonEditor.tryGetDevDependency(cyclicDependencyProject) ??
          {};
        if (
          existingVersion &&
          allowedAlternativeVersions?.get(cyclicDependencyProject)?.includes(existingVersion)
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
