// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';
import {
  AlreadyExistsBehavior,
  AlreadyReportedError,
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

type LinkType = 'LinkPackage' | 'BridgePackage';

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
    const pnpmSyncJsonPath: string = `${sourcePath}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmSyncFilename}`;
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
    const linkedPackageJsonPath: string = `${linkedPackagePath}/${FileConstants.PackageJson}`;

    if (!(await FileSystem.existsAsync(linkedPackageJsonPath))) {
      throw new Error(`Cannot find ${FileConstants.PackageJson} in the path ${linkedPackagePath}`);
    }

    const {
      dependencies = {},
      name: packageName,
      peerDependencies = {}
    }: INodePackageJson = await JsonFile.loadAsync(linkedPackageJsonPath);
    const linkedPackageNodeModulesPath: string = `${linkedPackagePath}/${RushConstants.nodeModulesFolderName}`;

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
    const { projectFolder: consumerProjectFolder, subspace } = consumerPackage;
    const { subspaceName: consumerSubspaceName } = subspace;

    const subspaceTempFolderPath: string = subspace.getSubspaceTempFolderPath();
    const consumerPackageNodeModulesPath: string = `${consumerProjectFolder}/${RushConstants.nodeModulesFolderName}`;
    const consumerPackagePnpmDependenciesFolderPath: string = `${subspaceTempFolderPath}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmDependenciesFolderName}`;
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
      Object.keys(peerDependencies).map(async (peerDependencyName) => {
        const sourcePeerDependencyPath: string = `${consumerPackageNodeModulesPath}/${peerDependencyName}`;
        if (!(await FileSystem.existsAsync(sourcePeerDependencyPath))) {
          throw new Error(`Cannot find "${peerDependencyName}"`);
        }

        const symlinkTargetPath: string = await FileSystem.getRealPathAsync(sourcePeerDependencyPath);
        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath: symlinkTargetPath,
          newLinkPath: `${linkedPackageDestination}/${peerDependencyName}`,
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
        const linkedPackageDependencyPath: string = `${linkedPackageNodeModulesPath}/${dependencyName}`;
        const linkedPackageDependencySourcePath: string =
          await FileSystem.getRealPathAsync(linkedPackageDependencyPath);

        const linkedPackageDependencySourcePathExists: boolean = await FileSystem.existsAsync(
          linkedPackageDependencySourcePath
        );
        if (!linkedPackageDependencySourcePathExists) {
          throw new Error(`External dependency "${dependencyName}" not found`);
        }

        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath: linkedPackageDependencySourcePath,
          newLinkPath: `${linkedPackageDestination}/${dependencyName}`,
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
        const packageSourcePath: string = `${consumerPackagePnpmDependenciesFolderPath}/${dirName}/${RushConstants.nodeModulesFolderName}/${packageName}`;
        const { version } = await JsonFile.loadAsync(`${packageSourcePath}/${FileConstants.PackageJson}`);
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
        const depFilename: string = depPathToFilename(`file:${linkedPackagePath}(${packageName})`, 120);
        const linkedPackageDestination: string = `${consumerPackagePnpmDependenciesFolderPath}/${depFilename}/${RushConstants.nodeModulesFolderName}`;

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

        const linkTargetPath: string = `${linkedPackageDestination}/${packageName}`;
        // Create hardlink to linkedPackage
        await this._hardLinkToLinkedPackageAsync(linkedPackagePath, linkTargetPath, consumerSubspaceName);

        // Create a symbolic link pointing to the directory.
        await FileSystem.createSymbolicLinkFolderAsync({
          linkTargetPath,
          newLinkPath: `${parentPackageDestination ?? consumerPackageNodeModulesPath}/${packageName}`,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });

        // Handle workspace dependencies recursively
        await Async.forEachAsync(workspaceDependencies, async (workspaceDependency) => {
          const linkedWorkspacePackagePath: string = await FileSystem.getRealPathAsync(
            `${linkedPackageNodeModulesPath}/${workspaceDependency}`
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
          consumerPackageLinks[existingLinkIndex].linkType = 'BridgePackage';
        } else {
          consumerPackageLinks.push({
            linkedPackagePath,
            linkedPackageName: packageName,
            linkType: 'BridgePackage'
          });
        }

        linkState[consumerSubspaceName] = consumerPackageLinks;
      });

      this._terminal.writeLine(
        Colorize.green(`Successfully bridge package "${packageName}" for "${consumerPackage.packageName}"`)
      );
    } catch (error) {
      this._terminal.writeErrorLine(
        Colorize.red(
          `Failed to bridge package "${linkedPackagePath}" to "${consumerPackage.packageName}": ${error.message}`
        )
      );

      const alreadyExistsError: Error = new AlreadyReportedError();
      alreadyExistsError.message = error.message;
      alreadyExistsError.stack = error.stack;
      throw alreadyExistsError;
    }
  }

  public async linkPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string
  ): Promise<void> {
    const consumerPackageName: string = consumerPackage.packageName;
    try {
      const { packageName: linkedPackageName } = await this._getLinkedPackageInfoAsync(linkedPackagePath);

      const slashIndex: number = linkedPackageName.indexOf('/');
      const [scope, packageBaseName] =
        slashIndex !== -1
          ? [linkedPackageName.substring(0, slashIndex), linkedPackageName.substring(slashIndex)]
          : [undefined, linkedPackageName];

      let sourceNodeModulesPath: string = `${consumerPackage.projectFolder}/${RushConstants.nodeModulesFolderName}`;
      if (scope) {
        sourceNodeModulesPath = `${sourceNodeModulesPath}/${scope}`;
      }

      if (!(await FileSystem.existsAsync(sourceNodeModulesPath))) {
        await FileSystem.ensureFolderAsync(sourceNodeModulesPath);
      }

      const symlinkPath: string = `${sourceNodeModulesPath}/${packageBaseName}`;

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
          consumerPackageLinks[existingLinkIndex].linkType = 'LinkPackage';
        } else {
          consumerPackageLinks.push({
            linkedPackagePath,
            linkedPackageName,
            linkType: 'LinkPackage'
          });
        }

        linkState[subspaceName] = consumerPackageLinks;
      });

      this._terminal.writeLine(
        Colorize.green(`Successfully link package "${linkedPackageName}" for "${consumerPackageName}"`)
      );
    } catch (error) {
      this._terminal.writeErrorLine(
        Colorize.red(
          `Failed to link package "${linkedPackagePath}" to "${consumerPackageName}": ${error.message}`
        )
      );

      const alreadyExistsError: Error = new AlreadyReportedError();
      alreadyExistsError.message = error.message;
      alreadyExistsError.stack = error.stack;
      throw alreadyExistsError;
    }
  }

  public static loadFromLinkStateFile(rushConfiguration: RushConfiguration): RushConnect {
    const rushLinkStateFilePath: string = `${rushConfiguration.commonTempFolder}/${RushConstants.rushLinkStateFilename}`;
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
