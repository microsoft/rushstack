import path from 'path';
import { Colorize, ConsoleTerminalProvider, ITerminal, Terminal } from '@rushstack/terminal';
import { Async, FileConstants, FileSystem, INodePackageJson, JsonFile } from '@rushstack/node-core-library';
import { depPathToFilename } from '@pnpm/dependency-path';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { PackageExtractor } from '@rushstack/package-extractor';

interface IRushLinkFileState {
  [consumerPackageName: string]: {
    linkedPackagePath: string;
    linkedPackageName: string;
  }[];
}

interface IRushLinkOptions {
  rushConfiguration: RushConfiguration;
  rushLinkStateFilePath: string;
  rushLinkState: IRushLinkFileState | undefined;
}

export class RushConnect {
  private readonly _terminal: ITerminal;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _rushLinkStateFilePath: string;
  private readonly _rushLinkState: IRushLinkFileState | undefined;

  constructor(options: IRushLinkOptions) {
    this._terminal = new Terminal(new ConsoleTerminalProvider());

    this._rushConfiguration = options.rushConfiguration;
    this._rushLinkStateFilePath = options.rushLinkStateFilePath;
    this._rushLinkState = options.rushLinkState;
  }

  private async _hardLinkToLinkedPackage(sourcePath: string, targetFolder: string) {
    const npmPackFiles: string[] = await PackageExtractor.getPackageIncludedFilesAsync(sourcePath);
    Async.forEachAsync(npmPackFiles, async (npmPackFile: string) => {
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
        const sourceFileIno = (await FileSystem.getStatisticsAsync(copySourcePath)).ino;
        const destinationFileIno = (await FileSystem.getStatisticsAsync(copyDestinationPath)).ino;
        if (sourceFileIno !== destinationFileIno) {
          await FileSystem.deleteFileAsync(copyDestinationPath);
          await FileSystem.createHardLinkAsync({
            linkTargetPath: copySourcePath,
            newLinkPath: copyDestinationPath
          });
        }
      }
    });
  }

  private async _modifyAndSaveLinkState(cb: (linkState: IRushLinkFileState) => void): Promise<void> {
    const linkState = this._rushLinkState ?? {};
    cb(linkState);
    await JsonFile.saveAsync(linkState, this._rushLinkStateFilePath);
  }

  public async isProjectDependencyLinkedAsync(project: RushConfigurationProject): Promise<boolean> {
    const projectName = project.packageName;
    if (this._rushLinkState && this._rushLinkState[projectName].length > 0) {
      this._modifyAndSaveLinkState((linkState) => {
        delete linkState[projectName];
      });
      return true;
    }
    return false;
  }

  private async _getLinkedPackageInfo(linkedPackagePath: string) {
    const linkedPackageJsonPath: string = path.resolve(linkedPackagePath, FileConstants.PackageJson);

    if (!(await FileSystem.existsAsync(linkedPackageJsonPath))) {
      throw new Error(`Cannot find ${FileConstants.PackageJson} in the path ${linkedPackagePath}`);
    }

    const {
      dependencies = {},
      name,
      peerDependencies = {}
    }: INodePackageJson = await JsonFile.loadAsync(linkedPackageJsonPath);
    const linkedPackageNodeModulesPath: string = path.resolve(
      linkedPackageJsonPath,
      RushConstants.nodeModulesFolderName
    );
    const [externalDependencies, workspaceDependencies] = Object.entries(dependencies).reduce(
      (prev, curr) => {
        const [packageName, protocol] = curr;
        const [externalDependencies, workspaceDependencies] = prev;
        if (protocol.startsWith('workspace')) {
          workspaceDependencies.push(packageName);
        } else {
          externalDependencies.push(packageName);
        }
        return prev;
      },
      [[] as string[], [] as string[]]
    );
    return {
      packageName: name,
      linkedPackageNodeModulesPath,
      externalDependencies,
      workspaceDependencies,
      peerDependencies: peerDependencies
    };
  }

  private _getConsumerPackageInfo(consumerPackage: RushConfigurationProject) {
    const consumerPackageNodeModulesPath: string = path.resolve(
      path.dirname(consumerPackage.projectFolder),
      RushConstants.nodeModulesFolderName
    );
    const consumerPackageDotDependencyPath: string = path.resolve(
      consumerPackage.subspace.getSubspaceTempFolderPath(),
      RushConstants.pnpmDependenciesFolderName
    );
    return {
      consumerPackageNodeModulesPath,
      consumerPackageDotDependencyPath
    };
  }

  public async bridgePackage(consumerPackage: RushConfigurationProject, linkedPackagePath: string) {
    const {
      peerDependencies: linkedPackagePeerDependencies,
      externalDependencies: linkedPackageDependencies,
      linkedPackageNodeModulesPath,
      packageName,
      workspaceDependencies
    } = await this._getLinkedPackageInfo(linkedPackagePath);
    const { consumerPackageNodeModulesPath, consumerPackageDotDependencyPath } =
      this._getConsumerPackageInfo(consumerPackage);

    // The path linked to the consumerPackage, in fact, the exact path name doesn't matter,
    // we only need to distinguish it from the path created by pnpm
    const linkedPackageDestination = path.resolve(
      consumerPackageDotDependencyPath,
      depPathToFilename(`file:${linkedPackagePath}(${packageName})`, 120),
      RushConstants.nodeModulesFolderName
    );

    await FileSystem.ensureFolderAsync(linkedPackageDestination);

    // Create a symbolic link to the dependencies of consumerPackage
    for (const peerDependency of Object.keys(linkedPackagePeerDependencies)) {
      const sourcePeerDependencyPath: string = path.resolve(consumerPackageNodeModulesPath, peerDependency);
      if (!(await FileSystem.existsAsync(sourcePeerDependencyPath))) {
        throw new Error(`Cannot find '${peerDependency}' in '${consumerPackage.packageName}'`);
      }
      const symlinkTargetPath: string = await FileSystem.readLinkAsync(sourcePeerDependencyPath);
      await FileSystem.createSymbolicLinkFolderAsync({
        linkTargetPath: symlinkTargetPath,
        newLinkPath: path.resolve(linkedPackageDestination, peerDependency)
      });
    }

    // Create a symbolic link to the dependencies of linkedPackage
    for (const dependencyName of linkedPackageDependencies) {
      const linkedPackageDependencyPath = path.resolve(linkedPackageNodeModulesPath, dependencyName);
      const linkedPackageDependencySourcePath =
        await FileSystem.getRealPathAsync(linkedPackageDependencyPath);
      if (!(await FileSystem.existsAsync(linkedPackageDependencySourcePath))) {
        throw new Error(`Cannot find '${dependencyName}' in '${consumerPackage.packageName}'`);
      }
      await FileSystem.createSymbolicLinkFolderAsync({
        linkTargetPath: linkedPackageDependencySourcePath,
        newLinkPath: path.resolve(linkedPackageDestination, dependencyName)
      });
    }

    // Create hardlink to linkedPackage
    await this._hardLinkToLinkedPackage(
      linkedPackagePath,
      path.resolve(linkedPackageDestination, packageName)
    );

    // For those package with "workspace" protocol, we should repeat the above process.
    await Async.forEachAsync(workspaceDependencies, async (workspaceDependency) => {
      const linkedWorkspacePackagePath = await FileSystem.getRealPathAsync(
        path.resolve(linkedPackageNodeModulesPath, workspaceDependency)
      );
      await this.bridgePackage(consumerPackage, linkedWorkspacePackagePath);
    });
  }

  public async linkPackage(consumerPackage: RushConfigurationProject, linkedPackagePath: string) {
    let { packageName: linkedPackageName } = await this._getLinkedPackageInfo(linkedPackagePath);

    let sourceNodeModulesPath: string = path.resolve(
      path.dirname(consumerPackage.projectFolder),
      RushConstants.nodeModulesFolderName
    );
    if (linkedPackageName.includes('/')) {
      const [scope, packageBaseName] = linkedPackageName.split('/');
      sourceNodeModulesPath = path.resolve(sourceNodeModulesPath, scope);
      linkedPackageName = packageBaseName;
    }

    if (!(await FileSystem.existsAsync(sourceNodeModulesPath))) {
      await FileSystem.ensureFolderAsync(sourceNodeModulesPath);
    }

    const symlinkPath: string = path.resolve(sourceNodeModulesPath, linkedPackageName);

    if (await FileSystem.existsAsync(symlinkPath)) {
      this._terminal.writeLine(
        Colorize.yellow(
          `Soft link already exists for '${linkedPackageName}' in '${RushConstants.nodeModulesFolderName}'. Deleting.`
        )
      );
      await FileSystem.deleteFileAsync(symlinkPath);
    }

    await FileSystem.createSymbolicLinkFolderAsync({
      linkTargetPath: linkedPackagePath,
      newLinkPath: symlinkPath
    });

    await this._modifyAndSaveLinkState((linkState) => {
      const sourceProjectLinks = linkState[consumerPackage.packageName] ?? [];
      sourceProjectLinks.push({
        linkedPackagePath,
        linkedPackageName
      });
      linkState[consumerPackage.packageName] = sourceProjectLinks;
    });

    this._terminal.writeLine(
      Colorize.green(
        `Successfully created a symbolic link for '${linkedPackageName}' in '${RushConstants.nodeModulesFolderName}'.`
      )
    );
  }

  public static loadFromLinkStateFileAsync(rushConfiguration: RushConfiguration): RushConnect {
    const rushLinkStateFilePath = path.join(
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
      rushConfiguration,
      rushLinkState
    });
  }
}
