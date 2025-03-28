// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { Colorize, ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';
import {
  AlreadyExistsBehavior,
  Async,
  FileConstants,
  FileSystem,
  JsonFile,
  type INodePackageJson,
  type IPackageJsonDependencyTable
} from '@rushstack/node-core-library';
import { type DependencyPath, depPathToFilename } from '@pnpm/dependency-path';
import { PackageExtractor } from '@rushstack/package-extractor';
import { pnpmSyncUpdateFileAsync, pnpmSyncCopyAsync, type ILogMessageCallbackOptions } from 'pnpm-sync-lib';
import { parse } from '@pnpm/dependency-path';
import * as semver from 'semver';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { PnpmSyncUtilities } from './PnpmSyncUtilities';

class RushConnectError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RushConnectError';
  }
}

enum LinkType {
  LinkPackage = 'LinkPackage',
  BridgePackage = 'BridgePackage'
}

interface IRushLinkFileState {
  [subspaceName: string]: {
    linkedPackagePath: string;
    linkedPackageName: string;
    linkType: LinkType;
  }[];
}

interface ILinkedPackageInfo {
  packageName: string;
  linkedPackageNodeModulesPath: string;
  externalDependencies: string[];
  workspaceDependencies: string[];
  peerDependencies: IPackageJsonDependencyTable;
}

interface IConsumerPackageInfo {
  consumerPackageNodeModulesPath: string;
  consumerPackagePnpmDependenciesFolderPath: string;
  consumerSubspaceName: string;
}

interface IRushLinkOptions {
  rushLinkStateFilePath: string;
  rushLinkState: IRushLinkFileState | undefined;
}

export class RushConnect {
  public readonly rushLinkState: IRushLinkFileState | undefined;

  private readonly _terminal: ITerminal;
  private readonly _rushLinkStateFilePath: string;

  public constructor(options: IRushLinkOptions) {
    this._terminal = new Terminal(new ConsoleTerminalProvider());

    this._rushLinkStateFilePath = options.rushLinkStateFilePath;
    this.rushLinkState = options.rushLinkState;
  }

  private async _hardLinkToLinkedPackageAsync(
    sourcePath: string,
    targetFolder: string,
    lockfileId: string
  ): Promise<void> {
    const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
      PnpmSyncUtilities.processLogMessage(logMessageOptions, this._terminal);
    };
    await pnpmSyncUpdateFileAsync({
      sourceProjectFolder: sourcePath,
      targetFolders: [targetFolder],
      lockfileId,
      logMessageCallback
    });
    const pnpmSyncJsonPath: string = path.resolve(
      sourcePath,
      RushConstants.nodeModulesFolderName,
      '.pnpm-sync.json'
    );
    await pnpmSyncCopyAsync({
      pnpmSyncJsonPath,
      ensureFolderAsync: FileSystem.ensureFolderAsync,
      forEachAsyncWithConcurrency: Async.forEachAsync,
      getPackageIncludedFiles: PackageExtractor.getPackageIncludedFilesAsync,
      logMessageCallback
    });
  }

  private async _modifyAndSaveLinkStateAsync(
    cb: (linkState: IRushLinkFileState) => Promise<void> | void
  ): Promise<void> {
    const linkState: IRushLinkFileState = this.rushLinkState ?? {};
    await Promise.resolve(cb(linkState));
    await JsonFile.saveAsync(linkState, this._rushLinkStateFilePath);
  }

  public async isSubspaceDependencyLinkedAsync(subspaceName: string): Promise<boolean> {
    if (!this.rushLinkState || !this.rushLinkState[subspaceName]?.length) {
      return false;
    }

    const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
      PnpmSyncUtilities.processLogMessage(logMessageOptions, this._terminal);
    };

    await this._modifyAndSaveLinkStateAsync(async (linkState) => {
      const rushLinkFileState: IRushLinkFileState[number] = linkState[subspaceName] ?? [];
      await Async.forEachAsync(rushLinkFileState, async ({ linkedPackagePath }) => {
        await pnpmSyncUpdateFileAsync({
          sourceProjectFolder: linkedPackagePath,
          targetFolders: [],
          lockfileId: subspaceName,
          logMessageCallback
        });
      });
      delete linkState[subspaceName];
    });

    return true;
  }

  private async _getLinkedPackageInfoAsync(linkedPackagePath: string): Promise<ILinkedPackageInfo> {
    const linkedPackageJsonPath: string = path.resolve(linkedPackagePath, FileConstants.PackageJson);

    if (!(await FileSystem.existsAsync(linkedPackageJsonPath))) {
      throw new Error(`Cannot find ${FileConstants.PackageJson} in the path ${linkedPackagePath}`);
    }

    const {
      dependencies = {},
      name: packageName,
      peerDependencies = {}
    }: INodePackageJson = await JsonFile.loadAsync(linkedPackageJsonPath);
    const linkedPackageNodeModulesPath: string = path.resolve(
      linkedPackagePath,
      RushConstants.nodeModulesFolderName
    );

    const externalDependencies: string[] = [];
    const workspaceDependencies: string[] = [];

    for (const [name, protocol] of Object.entries(dependencies)) {
      if (protocol.startsWith('workspace')) {
        workspaceDependencies.push(name);
      } else {
        externalDependencies.push(name);
      }
    }

    return {
      packageName,
      linkedPackageNodeModulesPath,
      externalDependencies,
      workspaceDependencies,
      peerDependencies
    };
  }

  private _getConsumerPackageInfo(consumerPackage: RushConfigurationProject): IConsumerPackageInfo {
    const consumerSubspaceName: string = consumerPackage.subspace.subspaceName;
    const consumerPackageNodeModulesPath: string = path.resolve(
      consumerPackage.projectFolder,
      RushConstants.nodeModulesFolderName
    );
    const consumerPackagePnpmDependenciesFolderPath: string = path.resolve(
      consumerPackage.subspace.getSubspaceTempFolderPath(),
      RushConstants.nodeModulesFolderName,
      RushConstants.pnpmDependenciesFolderName
    );
    return {
      consumerPackageNodeModulesPath,
      consumerSubspaceName,
      consumerPackagePnpmDependenciesFolderPath
    };
  }

  private async _handlePeerDependenciesAsync(
    consumerPackageNodeModulesPath: string,
    linkedPackageDestination: string,
    peerDependencies: IPackageJsonDependencyTable
  ): Promise<void> {
    await Promise.all(
      Object.keys(peerDependencies).map(async (peerDependency) => {
        const sourcePeerDependencyPath: string = path.resolve(consumerPackageNodeModulesPath, peerDependency);
        if (!(await FileSystem.existsAsync(sourcePeerDependencyPath))) {
          throw new Error(`Cannot find "${peerDependency}"`);
        }

        const symlinkTargetPath: string = await FileSystem.getRealPathAsync(sourcePeerDependencyPath);
        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath: symlinkTargetPath,
          newLinkPath: path.resolve(linkedPackageDestination, peerDependency),
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
      })
    );
  }

  private async _handleExternalDependenciesAsync(
    linkedPackageNodeModulesPath: string,
    linkedPackageDestination: string,
    externalDependencies: string[]
  ): Promise<void> {
    await Promise.all(
      externalDependencies.map(async (dependencyName) => {
        const linkedPackageDependencyPath: string = path.resolve(
          linkedPackageNodeModulesPath,
          dependencyName
        );
        const linkedPackageDependencySourcePath: string =
          await FileSystem.getRealPathAsync(linkedPackageDependencyPath);

        if (!(await FileSystem.existsAsync(linkedPackageDependencySourcePath))) {
          throw new RushConnectError(`External dependency "${dependencyName}" not found`);
        }

        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath: linkedPackageDependencySourcePath,
          newLinkPath: path.resolve(linkedPackageDestination, dependencyName),
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
      })
    );
  }

  private async _parsePackageVersionAsync(
    consumerPackagePnpmDependenciesFolderPath: string,
    packageName: string,
    versionRange: string
  ): Promise<string | undefined> {
    const subDirectories: string[] = await FileSystem.readFolderItemNamesAsync(
      consumerPackagePnpmDependenciesFolderPath
    );
    for (const dirName of subDirectories) {
      const parsedDependency: DependencyPath = parse(dirName);
      if (parsedDependency && parsedDependency.name === packageName) {
        const packageSourcePath: string = path.resolve(
          consumerPackagePnpmDependenciesFolderPath,
          dirName,
          RushConstants.nodeModulesFolderName,
          packageName
        );
        const { version } = await JsonFile.loadAsync(
          path.resolve(packageSourcePath, FileConstants.PackageJson)
        );
        if (semver.satisfies(version, versionRange)) {
          return packageSourcePath;
        }
      }
    }
    return undefined;
  }

  public async bridgePackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    version: string | undefined,
    parentPackageDestination?: string
  ): Promise<void> {
    try {
      const {
        packageName,
        peerDependencies,
        externalDependencies,
        workspaceDependencies,
        linkedPackageNodeModulesPath
      } = await this._getLinkedPackageInfoAsync(linkedPackagePath);

      const {
        consumerPackageNodeModulesPath,
        consumerPackagePnpmDependenciesFolderPath,
        consumerSubspaceName
      } = this._getConsumerPackageInfo(consumerPackage);

      if (version) {
        const sourcePath: string | undefined = await this._parsePackageVersionAsync(
          consumerPackagePnpmDependenciesFolderPath,
          packageName,
          version
        );
        if (!sourcePath) {
          throw new Error(
            `Cannot find package ${packageName} in ${consumerPackagePnpmDependenciesFolderPath}`
          );
        }
        await this._hardLinkToLinkedPackageAsync(linkedPackagePath, sourcePath, consumerSubspaceName);
      } else {
        // Generate unique destination path for linked package
        const linkedPackageDestination: string = path.resolve(
          consumerPackagePnpmDependenciesFolderPath,
          depPathToFilename(`file:${linkedPackagePath}(${packageName})`, 120),
          RushConstants.nodeModulesFolderName
        );

        await FileSystem.ensureFolderAsync(linkedPackageDestination);

        // Handle peer dependencies
        await this._handlePeerDependenciesAsync(
          consumerPackageNodeModulesPath,
          linkedPackageDestination,
          peerDependencies
        );

        // Handle external dependencies
        await this._handleExternalDependenciesAsync(
          linkedPackageNodeModulesPath,
          linkedPackageDestination,
          externalDependencies
        );

        // Create hardlink to linkedPackage
        await this._hardLinkToLinkedPackageAsync(
          linkedPackagePath,
          path.resolve(linkedPackageDestination, packageName),
          consumerSubspaceName
        );

        // Create a symbolic link pointing to the directory.
        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath: path.resolve(linkedPackageDestination, packageName),
          newLinkPath: path.resolve(parentPackageDestination ?? consumerPackageNodeModulesPath, packageName),
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });

        // Handle workspace dependencies recursively
        await Async.forEachAsync(workspaceDependencies, async (workspaceDependency) => {
          const linkedWorkspacePackagePath: string = await FileSystem.getRealPathAsync(
            path.resolve(linkedPackageNodeModulesPath, workspaceDependency)
          );
          await this.bridgePackageAsync(
            consumerPackage,
            linkedWorkspacePackagePath,
            version,
            linkedPackageDestination
          );
        });
      }

      // Record the link information between the consumer package and the linked package
      await this._modifyAndSaveLinkStateAsync((linkState) => {
        const consumerPackageLinks: IRushLinkFileState[number] = linkState[consumerSubspaceName] ?? [];
        const existingLinkIndex: number = consumerPackageLinks.findIndex(
          (link) => link.linkedPackageName === packageName
        );

        if (existingLinkIndex >= 0) {
          consumerPackageLinks[existingLinkIndex].linkedPackagePath = linkedPackagePath;
          consumerPackageLinks[existingLinkIndex].linkType = LinkType.BridgePackage;
        } else {
          consumerPackageLinks.push({
            linkedPackagePath,
            linkedPackageName: packageName,
            linkType: LinkType.BridgePackage
          });
        }

        linkState[consumerSubspaceName] = consumerPackageLinks;
      });

      this._terminal.writeLine(
        Colorize.green(`Successfully bridge package "${packageName}" for "${consumerPackage.packageName}"`)
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new RushConnectError(
          `Failed to bridge package "${linkedPackagePath}" to "${consumerPackage.packageName}": ${error.message}`
        );
      }
      throw error;
    }
  }

  public async linkPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string
  ): Promise<void> {
    const consumerPackageName: string = consumerPackage.packageName;
    try {
      const { packageName: linkedPackageName } = await this._getLinkedPackageInfoAsync(linkedPackagePath);

      const isScoped: boolean = linkedPackageName.includes('/');
      const [scope, packageBaseName] = isScoped ? linkedPackageName.split('/') : [null, linkedPackageName];

      let sourceNodeModulesPath: string = path.resolve(
        consumerPackage.projectFolder,
        RushConstants.nodeModulesFolderName
      );
      if (isScoped) {
        sourceNodeModulesPath = path.resolve(sourceNodeModulesPath, scope!);
      }

      if (!(await FileSystem.existsAsync(sourceNodeModulesPath))) {
        await FileSystem.ensureFolderAsync(sourceNodeModulesPath);
      }

      const symlinkPath: string = path.resolve(sourceNodeModulesPath, packageBaseName);

      // Create symlink to linkedPackage
      await FileSystem.createSymbolicLinkFolderAsync({
        linkTargetPath: linkedPackagePath,
        newLinkPath: symlinkPath,
        alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
      });

      // Record the link information between the consumer package and the linked package
      await this._modifyAndSaveLinkStateAsync((linkState) => {
        const subspaceName: string = consumerPackage.subspace.subspaceName;
        const consumerPackageLinks: IRushLinkFileState[number] = linkState[subspaceName] ?? [];
        const existingLinkIndex: number = consumerPackageLinks.findIndex(
          (link) => link.linkedPackageName === linkedPackageName
        );

        if (existingLinkIndex >= 0) {
          consumerPackageLinks[existingLinkIndex].linkedPackagePath = linkedPackagePath;
          consumerPackageLinks[existingLinkIndex].linkType = LinkType.LinkPackage;
        } else {
          consumerPackageLinks.push({
            linkedPackagePath,
            linkedPackageName,
            linkType: LinkType.LinkPackage
          });
        }

        linkState[subspaceName] = consumerPackageLinks;
      });

      this._terminal.writeLine(
        Colorize.green(`Successfully link package "${linkedPackageName}" for "${consumerPackageName}"`)
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new RushConnectError(
          `Failed to link package "${linkedPackagePath}" to "${consumerPackageName}": ${error.message}`
        );
      }
      throw error;
    }
  }

  public static loadFromLinkStateFile(rushConfiguration: RushConfiguration): RushConnect {
    const rushLinkStateFilePath: string = path.join(
      rushConfiguration.commonTempFolder,
      RushConstants.rushLinkStateFilename
    );
    let rushLinkState: IRushLinkFileState | undefined;
    try {
      rushLinkState = JsonFile.load(rushLinkStateFilePath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        // do nothing
      } else {
        throw error;
      }
    }
    return new RushConnect({
      rushLinkStateFilePath,
      rushLinkState
    });
  }
}
