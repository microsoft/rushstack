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
import { depPathToFilename } from '@pnpm/dependency-path';
import { PackageExtractor } from '@rushstack/package-extractor';
import { pnpmSyncUpdateFileAsync, pnpmSyncCopyAsync, type ILogMessageCallbackOptions } from 'pnpm-sync-lib';

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
  [consumerPackageName: string]: {
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
}

interface IRushLinkOptions {
  rushLinkStateFilePath: string;
  rushLinkState: IRushLinkFileState | undefined;
}

export class RushConnect {
  private readonly _terminal: ITerminal;
  private readonly _rushLinkStateFilePath: string;
  private readonly _rushLinkState: IRushLinkFileState | undefined;

  public constructor(options: IRushLinkOptions) {
    this._terminal = new Terminal(new ConsoleTerminalProvider());

    this._rushLinkStateFilePath = options.rushLinkStateFilePath;
    this._rushLinkState = options.rushLinkState;
  }

  private async _hardLinkToLinkedPackageAsync(
    sourcePath: string,
    targetFolder: string,
    consumerPackageNodeModulesPath: string
  ): Promise<void> {
    const npmPackFiles: string[] = await PackageExtractor.getPackageIncludedFilesAsync(sourcePath);
    await Async.forEachAsync(npmPackFiles, async (npmPackFile: string) => {
      const copySourcePath: string = path.join(sourcePath, npmPackFile);
      const copyDestinationPath: string = path.join(targetFolder, npmPackFile);
      if (!(await FileSystem.existsAsync(copyDestinationPath))) {
        // if not exist in target folder, we just copy it
        await FileSystem.ensureFolderAsync(path.dirname(copyDestinationPath));
        await FileSystem.createHardLinkAsync({
          linkTargetPath: copySourcePath,
          newLinkPath: copyDestinationPath
        });
      } else {
        // if exist in target folder, check if it still point to the source Inode number
        // in our copy implementation, we use hard link to copy files
        // so that, we can utilize the file inode info to determine the equality of two files
        const sourceFileIno: number = (await FileSystem.getStatisticsAsync(copySourcePath)).ino;
        const destinationFileIno: number = (await FileSystem.getStatisticsAsync(copyDestinationPath)).ino;
        if (sourceFileIno !== destinationFileIno) {
          await FileSystem.deleteFileAsync(copyDestinationPath);
          await FileSystem.createHardLinkAsync({
            linkTargetPath: copySourcePath,
            newLinkPath: copyDestinationPath
          });
        }
      }
    });
    // Finally, create a symbolic link pointing to the directory.
    await FileSystem.createSymbolicLinkFolderAsync({
      linkTargetPath: targetFolder,
      newLinkPath: consumerPackageNodeModulesPath,
      alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
    });
  }

  private async _modifyAndSaveLinkStateAsync(
    cb: (linkState: IRushLinkFileState) => Promise<void> | void
  ): Promise<void> {
    const linkState: IRushLinkFileState = this._rushLinkState ?? {};
    await Promise.resolve(cb(linkState));
    await JsonFile.saveAsync(linkState, this._rushLinkStateFilePath);
  }

  public async isProjectDependencyLinkedAsync(project: RushConfigurationProject): Promise<boolean> {
    const projectName: string = project.packageName;
    if (!this._rushLinkState || !this._rushLinkState[projectName]?.length) {
      return false;
    }

    const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
      PnpmSyncUtilities.processLogMessage(logMessageOptions, this._terminal);
    };

    await this._modifyAndSaveLinkStateAsync(async (linkState) => {
      const rushLinkFileState: IRushLinkFileState[number] = linkState[projectName] ?? [];
      await Async.forEachAsync(rushLinkFileState, async ({ linkedPackagePath }) => {
        await pnpmSyncUpdateFileAsync({
          sourceProjectFolder: linkedPackagePath,
          targetFolders: [],
          lockfileId: project.subspace.subspaceName,
          logMessageCallback
        });
      });
      delete linkState[projectName];
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

        const symlinkTargetPath: string = await FileSystem.getRealPath(sourcePeerDependencyPath);
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

  public async bridgePackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    replace: boolean,
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

      const { consumerPackageNodeModulesPath, consumerPackagePnpmDependenciesFolderPath } =
        this._getConsumerPackageInfo(consumerPackage);

      if (replace) {
        if (!(await FileSystem.existsAsync(path.resolve(consumerPackageNodeModulesPath, packageName)))) {
          throw new Error(`Cannot find ${packageName} under ${consumerPackageNodeModulesPath}`);
        }

        const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
          PnpmSyncUtilities.processLogMessage(logMessageOptions, this._terminal);
        };
        const sourcePath: string = await FileSystem.getRealPath(
          path.resolve(consumerPackageNodeModulesPath, packageName)
        );
        await pnpmSyncUpdateFileAsync({
          sourceProjectFolder: linkedPackagePath,
          targetFolders: [sourcePath],
          lockfileId: consumerPackage.subspace.subspaceName,
          logMessageCallback
        });
        const pnpmSyncJsonPath: string = path.resolve(
          linkedPackagePath,
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
          path.resolve(parentPackageDestination ?? consumerPackageNodeModulesPath, packageName)
        );

        // Handle workspace dependencies recursively
        await Async.forEachAsync(workspaceDependencies, async (workspaceDependency) => {
          const linkedWorkspacePackagePath: string = await FileSystem.getRealPathAsync(
            path.resolve(linkedPackageNodeModulesPath, workspaceDependency)
          );
          await this.bridgePackageAsync(
            consumerPackage,
            linkedWorkspacePackagePath,
            replace,
            linkedPackageDestination
          );
        });
      }

      // Record the link information between the consumer package and the linked package
      await this._modifyAndSaveLinkStateAsync((linkState) => {
        const consumerPackageLinks: IRushLinkFileState[number] = linkState[consumerPackage.packageName] ?? [];
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

        linkState[consumerPackage.packageName] = consumerPackageLinks;
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
        const consumerPackageLinks: IRushLinkFileState[number] = linkState[consumerPackageName] ?? [];
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

        linkState[consumerPackageName] = consumerPackageLinks;
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
