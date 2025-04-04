// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, type ITerminal } from '@rushstack/terminal';
import {
  AlreadyExistsBehavior,
  AlreadyReportedError,
  Async,
  FileConstants,
  FileSystem,
  JsonFile,
  JsonSchema,
  type INodePackageJson,
  type IPackageJsonDependencyTable
} from '@rushstack/node-core-library';
import type { DependencyPath } from '@pnpm/dependency-path';
import { PackageExtractor } from '@rushstack/package-extractor';
import { pnpmSyncUpdateFileAsync, pnpmSyncCopyAsync, type ILogMessageCallbackOptions } from 'pnpm-sync-lib';
import { parse } from '@pnpm/dependency-path';
import * as semver from 'semver';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { PnpmSyncUtilities } from './PnpmSyncUtilities';
import { BaseLinkManager, SymlinkKind } from '../logic/base/BaseLinkManager';
import schema from '../schemas/rush-hotlink-state.schema.json';
import { PURGE_ACTION_NAME } from './actionNameConstants';
import type { Subspace } from '../api/Subspace';

type HotlinkLinkType = 'LinkPackage' | 'BridgePackage';

interface IProjectLinkInSubspaceJson {
  linkedPackagePath: string;
  linkedPackageName: string;
  affectedPnpmVirtualStoreFolderNames?: string[];
  linkType: HotlinkLinkType;
}

interface IProjectLinksStateJson {
  fileVersion: 0;
  linksBySubspace: Record<string, IProjectLinkInSubspaceJson[]>;
}

interface ILinkedPackageInfo {
  packageName: string;
  linkedPackageNodeModulesPath: string;
  externalDependencies: string[];
  workspaceDependencies: string[];
  peerDependencies: IPackageJsonDependencyTable;
}

// interface IConsumerPackageInfo {
//   consumerPackageNodeModulesPath: string;
//   consumerPackagePnpmDependenciesFolderPath: string;
//   consumerSubspaceName: string;
// }

type LinksBySubspaceNameMap = Map<string, IProjectLinkInSubspaceJson[]>;

interface IRushLinkOptions {
  rushLinkStateFilePath: string;
  linksBySubspaceName: LinksBySubspaceNameMap;
}

const PROJECT_LINKS_STATE_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(schema);

export class HotlinkManager {
  private _linksBySubspaceName: LinksBySubspaceNameMap;
  private readonly _rushLinkStateFilePath: string;

  private constructor(options: IRushLinkOptions) {
    const { rushLinkStateFilePath, linksBySubspaceName } = options;
    this._rushLinkStateFilePath = rushLinkStateFilePath;
    this._linksBySubspaceName = linksBySubspaceName;
  }

  public hasAnyHotlinksInSubspace(subspaceName: string): boolean {
    return !!this._linksBySubspaceName.get(subspaceName)?.length;
  }

  private async _hardLinkToLinkedPackageAsync(
    terminal: ITerminal,
    sourcePath: string,
    targetFolder: Set<string>,
    lockfileId: string
  ): Promise<void> {
    const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
      PnpmSyncUtilities.processLogMessage(logMessageOptions, terminal);
    };
    await pnpmSyncUpdateFileAsync({
      sourceProjectFolder: sourcePath,
      targetFolders: Array.from(targetFolder),
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
    cb: (linkState: LinksBySubspaceNameMap) => Promise<LinksBySubspaceNameMap> | LinksBySubspaceNameMap
  ): Promise<void> {
    const newLinksBySubspaceName: LinksBySubspaceNameMap = await cb(this._linksBySubspaceName);
    this._linksBySubspaceName = newLinksBySubspaceName;
    const linkStateJson: IProjectLinksStateJson = {
      fileVersion: 0,
      linksBySubspace: Object.fromEntries(newLinksBySubspaceName)
    };
    await JsonFile.saveAsync(linkStateJson, this._rushLinkStateFilePath);
  }

  public async purgeLinksAsync(terminal: ITerminal, subspaceName: string): Promise<boolean> {
    if (!this.hasAnyHotlinksInSubspace(subspaceName)) {
      return false;
    }

    const logMessageCallback = (logMessageOptions: ILogMessageCallbackOptions): void => {
      PnpmSyncUtilities.processLogMessage(logMessageOptions, terminal);
    };

    await this._modifyAndSaveLinkStateAsync(async (linksBySubspaceName) => {
      const rushLinkFileState: IProjectLinkInSubspaceJson[] = linksBySubspaceName.get(subspaceName) ?? [];
      await Async.forEachAsync(
        rushLinkFileState,
        async ({ linkedPackagePath, affectedPnpmVirtualStoreFolderNames = [] }) => {
          await pnpmSyncUpdateFileAsync({
            sourceProjectFolder: linkedPackagePath,
            targetFolders: [],
            lockfileId: subspaceName,
            logMessageCallback
          });
          // pnpm will reuse packages in .pnpm directory, so we need to manually delete them before installation
          await Async.forEachAsync(
            affectedPnpmVirtualStoreFolderNames,
            async (affectedPnpmVirtualStoreFolderName) => {
              await FileSystem.deleteFolderAsync(affectedPnpmVirtualStoreFolderName);
            },
            { concurrency: 10 }
          );
        },
        { concurrency: 10 }
      );

      const newLinksBySubspaceName: LinksBySubspaceNameMap = new Map(linksBySubspaceName);
      newLinksBySubspaceName.delete(subspaceName);
      return newLinksBySubspaceName;
    });

    return true;
  }

  private async _getLinkedPackageInfoAsync(linkedPackagePath: string): Promise<ILinkedPackageInfo> {
    const linkedPackageJsonPath: string = `${linkedPackagePath}/${FileConstants.PackageJson}`;

    const linkedPackageJsonExists: boolean = await FileSystem.existsAsync(linkedPackageJsonPath);
    if (!linkedPackageJsonExists) {
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

  // private _getConsumerPackageInfo(consumerPackage: RushConfigurationProject): IConsumerPackageInfo {
  //   const { projectFolder: consumerProjectFolder, subspace } = consumerPackage;
  //   const { subspaceName: consumerSubspaceName } = subspace;

  //   const subspaceTempFolderPath: string = subspace.getSubspaceTempFolderPath();
  //   const consumerPackageNodeModulesPath: string = `${consumerProjectFolder}/${RushConstants.nodeModulesFolderName}`;
  //   const consumerPackagePnpmDependenciesFolderPath: string = `${subspaceTempFolderPath}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmVirtualStoreFolderName}`;
  //   return {
  //     consumerPackageNodeModulesPath,
  //     consumerSubspaceName,
  //     consumerPackagePnpmDependenciesFolderPath
  //   };
  // }

  // private async _handlePeerDependenciesAsync(
  //   consumerPackageNodeModulesPath: string,
  //   linkedPackageDestination: string,
  //   peerDependencies: IPackageJsonDependencyTable
  // ): Promise<void> {
  //   await Async.forEachAsync(
  //     Object.keys(peerDependencies),
  //     async (peerDependencyName) => {
  //       const sourcePeerDependencyPath: string = `${consumerPackageNodeModulesPath}/${peerDependencyName}`;
  //       const sourcePeerDependencyPathExists: boolean = await FileSystem.existsAsync(
  //         sourcePeerDependencyPath
  //       );
  //       if (!sourcePeerDependencyPathExists) {
  //         throw new Error(`Cannot find "${peerDependencyName}"`);
  //       }

  //       const symlinkTargetPath: string = await FileSystem.getRealPathAsync(sourcePeerDependencyPath);
  //       await BaseLinkManager._createSymlinkAsync({
  //         symlinkKind: SymlinkKind.Directory,
  //         linkTargetPath: symlinkTargetPath,
  //         newLinkPath: `${linkedPackageDestination}/${peerDependencyName}`,
  //         alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
  //       });
  //     },
  //     { concurrency: 10 }
  //   );
  // }

  // private async _handleExternalDependenciesAsync(
  //   linkedPackageNodeModulesPath: string,
  //   linkedPackageDestination: string,
  //   externalDependencies: string[]
  // ): Promise<void> {
  //   await Async.forEachAsync(
  //     externalDependencies,
  //     async (dependencyName) => {
  //       const linkedPackageDependencyPath: string = `${linkedPackageNodeModulesPath}/${dependencyName}`;
  //       const linkedPackageDependencySourcePath: string = await FileSystem.getRealPathAsync(
  //         linkedPackageDependencyPath
  //       );

  //       const linkedPackageDependencySourcePathExists: boolean = await FileSystem.existsAsync(
  //         linkedPackageDependencySourcePath
  //       );
  //       if (!linkedPackageDependencySourcePathExists) {
  //         throw new Error(`External dependency "${dependencyName}" not found`);
  //       }

  //       await BaseLinkManager._createSymlinkAsync({
  //         symlinkKind: SymlinkKind.Directory,
  //         linkTargetPath: linkedPackageDependencySourcePath,
  //         newLinkPath: `${linkedPackageDestination}/${dependencyName}`,
  //         alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
  //       });
  //     },
  //     { concurrency: 10 }
  //   );
  // }

  private async _parsePackageVersionAsync(
    consumerPackagePnpmDependenciesFolderPath: string,
    packageName: string,
    versionRange: string
  ): Promise<Set<string>> {
    const subDirectories: string[] = await FileSystem.readFolderItemNamesAsync(
      consumerPackagePnpmDependenciesFolderPath
    );
    const packageSourcePathSet: Set<string> = new Set();
    for (const dirName of subDirectories) {
      const parsedDependency: DependencyPath = parse(dirName);
      if (parsedDependency && parsedDependency.name === packageName) {
        const packageSourcePath: string = `${consumerPackagePnpmDependenciesFolderPath}/${dirName}/${RushConstants.nodeModulesFolderName}/${packageName}`;
        const { version } = await JsonFile.loadAsync(`${packageSourcePath}/${FileConstants.PackageJson}`);
        if (semver.satisfies(version, versionRange)) {
          packageSourcePathSet.add(packageSourcePath);
        }
      }
    }
    return packageSourcePathSet;
  }

  public async bridgePackageAsync(
    terminal: ITerminal,
    subspace: Subspace,
    linkedPackagePath: string,
    version: string
  ): Promise<void> {
    const subspaceName: string = subspace.subspaceName;
    try {
      const { packageName } = await this._getLinkedPackageInfoAsync(linkedPackagePath);
      const consumerPackagePnpmDependenciesFolderPath: string = `${subspace.getSubspaceTempFolderPath()}/${
        RushConstants.nodeModulesFolderName
      }/${RushConstants.pnpmVirtualStoreFolderName}`;
      const sourcePathSet: Set<string> = await this._parsePackageVersionAsync(
        consumerPackagePnpmDependenciesFolderPath,
        packageName,
        version
      );
      if (sourcePathSet.size === 0) {
        throw new Error(`Cannot find package ${packageName} in ${consumerPackagePnpmDependenciesFolderPath}`);
      }
      await this._hardLinkToLinkedPackageAsync(terminal, linkedPackagePath, sourcePathSet, subspaceName);
      await this._modifyAndSaveLinkStateAsync((linksBySubspaceName) => {
        const newConsumerPackageLinks: IProjectLinkInSubspaceJson[] = [
          ...(linksBySubspaceName.get(subspaceName) ?? [])
        ];
        const existingLinkIndex: number = newConsumerPackageLinks.findIndex(
          (link) => link.linkedPackageName === packageName
        );

        if (existingLinkIndex >= 0) {
          newConsumerPackageLinks.splice(existingLinkIndex, 1);
        }

        newConsumerPackageLinks.push({
          linkedPackagePath,
          linkedPackageName: packageName,
          affectedPnpmVirtualStoreFolderNames: Array.from(sourcePathSet),
          linkType: 'BridgePackage'
        });

        const newLinksBySubspaceName: LinksBySubspaceNameMap = new Map(linksBySubspaceName);
        newLinksBySubspaceName.set(subspaceName, newConsumerPackageLinks);
        return newLinksBySubspaceName;
      });

      terminal.writeLine(
        Colorize.green(`Successfully bridged package "${packageName}" for "${subspaceName}"`)
      );
    } catch (error) {
      terminal.writeErrorLine(
        Colorize.red(`Failed to bridge package "${linkedPackagePath}" to "${subspaceName}": ${error.message}`)
      );

      const alreadyExistsError: Error = new AlreadyReportedError();
      alreadyExistsError.message = error.message;
      alreadyExistsError.stack = error.stack;
      throw alreadyExistsError;
    }
  }

  // public async bridgePackageAsync(
  //   terminal: ITerminal,
  //   consumerPackage: RushConfigurationProject,
  //   linkedPackagePath: string,
  //   version: string | undefined,
  //   parentPackageDestination?: string
  // ): Promise<void> {
  //   try {
  //     const {
  //       packageName,
  //       peerDependencies,
  //       externalDependencies,
  //       workspaceDependencies,
  //       linkedPackageNodeModulesPath
  //     } = await this._getLinkedPackageInfoAsync(linkedPackagePath);

  //     const {
  //       consumerPackageNodeModulesPath,
  //       consumerPackagePnpmDependenciesFolderPath,
  //       consumerSubspaceName
  //     } = this._getConsumerPackageInfo(consumerPackage);

  //     if (version) {
  //       const sourcePath: string | undefined = await this._parsePackageVersionAsync(
  //         consumerPackagePnpmDependenciesFolderPath,
  //         packageName,
  //         version
  //       );
  //       if (!sourcePath) {
  //         throw new Error(
  //           `Cannot find package ${packageName} in ${consumerPackagePnpmDependenciesFolderPath}`
  //         );
  //       }
  //       await this._hardLinkToLinkedPackageAsync(
  //         terminal,
  //         linkedPackagePath,
  //         sourcePath,
  //         consumerSubspaceName
  //       );
  //     } else {
  //       // Generate unique destination path for linked package
  //       const depFilename: string = depPathToFilename(`file:${linkedPackagePath}(${packageName})`, 120);
  //       const linkedPackageDestination: string = `${consumerPackagePnpmDependenciesFolderPath}/${depFilename}/${RushConstants.nodeModulesFolderName}`;

  //       await FileSystem.ensureFolderAsync(linkedPackageDestination);

  //       // Handle peer dependencies
  //       await this._handlePeerDependenciesAsync(
  //         consumerPackageNodeModulesPath,
  //         linkedPackageDestination,
  //         peerDependencies
  //       );

  //       // Handle external dependencies
  //       await this._handleExternalDependenciesAsync(
  //         linkedPackageNodeModulesPath,
  //         linkedPackageDestination,
  //         externalDependencies
  //       );

  //       const linkTargetPath: string = `${linkedPackageDestination}/${packageName}`;
  //       // Create hardlink to linkedPackage
  //       await this._hardLinkToLinkedPackageAsync(
  //         terminal,
  //         linkedPackagePath,
  //         linkTargetPath,
  //         consumerSubspaceName
  //       );

  //       // Create a symbolic link pointing to the directory.
  //       await BaseLinkManager._createSymlinkAsync({
  //         symlinkKind: SymlinkKind.Directory,
  //         linkTargetPath,
  //         newLinkPath: `${parentPackageDestination ?? consumerPackageNodeModulesPath}/${packageName}`,
  //         alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
  //       });

  //       // Handle workspace dependencies recursively
  //       await Async.forEachAsync(workspaceDependencies, async (workspaceDependency) => {
  //         const linkedWorkspacePackagePath: string = await FileSystem.getRealPathAsync(
  //           `${linkedPackageNodeModulesPath}/${workspaceDependency}`
  //         );
  //         await this.bridgePackageAsync(
  //           terminal,
  //           consumerPackage,
  //           linkedWorkspacePackagePath,
  //           version,
  //           linkedPackageDestination
  //         );
  //       });
  //     }

  //     // Record the link information between the consumer package and the linked package
  //     await this._modifyAndSaveLinkStateAsync((linksBySubspaceName) => {
  //       const newConsumerPackageLinks: IProjectLinkInSubspaceJson[] = [
  //         ...(linksBySubspaceName.get(consumerSubspaceName) ?? [])
  //       ];
  //       const existingLinkIndex: number = newConsumerPackageLinks.findIndex(
  //         (link) => link.linkedPackageName === packageName
  //       );

  //       if (existingLinkIndex >= 0) {
  //         newConsumerPackageLinks.splice(existingLinkIndex, 1);
  //       }

  //       newConsumerPackageLinks.push({
  //         linkedPackagePath,
  //         linkedPackageName: packageName,
  //         linkType: 'BridgePackage'
  //       });

  //       const newLinksBySubspaceName: LinksBySubspaceNameMap = new Map(linksBySubspaceName);
  //       newLinksBySubspaceName.set(consumerSubspaceName, newConsumerPackageLinks);
  //       return newLinksBySubspaceName;
  //     });

  //     terminal.writeLine(
  //       Colorize.green(`Successfully bridged package "${packageName}" for "${consumerPackage.packageName}"`)
  //     );
  //   } catch (error) {
  //     terminal.writeErrorLine(
  //       Colorize.red(
  //         `Failed to bridge package "${linkedPackagePath}" to "${consumerPackage.packageName}": ${error.message}`
  //       )
  //     );

  //     const alreadyExistsError: Error = new AlreadyReportedError();
  //     alreadyExistsError.message = error.message;
  //     alreadyExistsError.stack = error.stack;
  //     throw alreadyExistsError;
  //   }
  // }

  public async linkPackageAsync(
    terminal: ITerminal,
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

      await FileSystem.ensureFolderAsync(sourceNodeModulesPath);

      const symlinkPath: string = `${sourceNodeModulesPath}/${packageBaseName}`;

      // Create symlink to linkedPackage
      await BaseLinkManager._createSymlinkAsync({
        symlinkKind: SymlinkKind.Directory,
        linkTargetPath: linkedPackagePath,
        newLinkPath: symlinkPath,
        alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
      });

      // Record the link information between the consumer package and the linked package
      await this._modifyAndSaveLinkStateAsync((linksBySubspaceName) => {
        const subspaceName: string = consumerPackage.subspace.subspaceName;
        const newConsumerPackageLinks: IProjectLinkInSubspaceJson[] = [
          ...(linksBySubspaceName.get(subspaceName) ?? [])
        ];
        const existingLinkIndex: number = newConsumerPackageLinks.findIndex(
          (link) => link.linkedPackageName === linkedPackageName
        );

        if (existingLinkIndex >= 0) {
          newConsumerPackageLinks.splice(existingLinkIndex, 1);
        }

        newConsumerPackageLinks.push({
          linkedPackagePath,
          linkedPackageName,
          linkType: 'LinkPackage'
        });

        const newLinksBySubspaceName: LinksBySubspaceNameMap = new Map(linksBySubspaceName);
        newLinksBySubspaceName.set(subspaceName, newConsumerPackageLinks);
        return newLinksBySubspaceName;
      });

      terminal.writeLine(
        Colorize.green(`Successfully linked package "${linkedPackageName}" for "${consumerPackageName}"`)
      );
    } catch (error) {
      terminal.writeErrorLine(
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

  public static loadFromRushConfiguration(rushConfiguration: RushConfiguration): HotlinkManager {
    // TODO: make this function async
    const rushLinkStateFilePath: string = `${rushConfiguration.commonTempFolder}/${RushConstants.rushHotlinkStateFilename}`;
    let rushLinkState: IProjectLinksStateJson | undefined;
    try {
      rushLinkState = JsonFile.loadAndValidate(rushLinkStateFilePath, PROJECT_LINKS_STATE_JSON_SCHEMA);
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) {
        throw error;
      }
    }

    if (!rushLinkState) {
      return new HotlinkManager({
        rushLinkStateFilePath,
        linksBySubspaceName: new Map()
      });
    } else {
      const { fileVersion, linksBySubspace } = rushLinkState;
      if (fileVersion !== 0) {
        throw new Error(
          `The rush project link state file "${rushLinkStateFilePath}" has an unexpected format, so this repo's ` +
            `installation state is likely in an inconsistent state. Run 'rush ${PURGE_ACTION_NAME}' purge to clear ` +
            `the installation.`
        );
      } else {
        const linksBySubspaceName: LinksBySubspaceNameMap = new Map(Object.entries(linksBySubspace));

        return new HotlinkManager({
          rushLinkStateFilePath,
          linksBySubspaceName
        });
      }
    }
  }
}
