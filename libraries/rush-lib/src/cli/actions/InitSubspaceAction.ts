// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import { Async, FileSystem, JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

import { assetsFolderPath } from '../../utilities/PathConstants';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { type ISubspacesConfigurationJson, SubspacesConfiguration } from '../../api/SubspacesConfiguration';
import { copyTemplateFileAsync } from '../../utilities/templateUtilities';
import * as path from 'path';

export class InitSubspaceAction extends BaseRushAction {
  private readonly _subspaceNameParameter: IRequiredCommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init-subspace',
      summary: 'Create a new subspace.',
      documentation:
        'Use this command to create a new subspace with the default subspace configuration files.',
      parser
    });

    this._subspaceNameParameter = this.defineStringParameter({
      parameterLongName: '--name',
      parameterShortName: '-n',
      argumentName: 'SUBSPACE_NAME',
      description: 'The name of the subspace that is being initialized.',
      required: true
    });
  }

  protected async runAsync(): Promise<void> {
    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());

    if (!this.rushConfiguration.subspacesFeatureEnabled) {
      throw new Error('Unable to create a subspace because the subspaces feature is not enabled.');
    }

    const subspacesConfiguration: SubspacesConfiguration = this.rushConfiguration
      .subspacesConfiguration as SubspacesConfiguration;
    // Verify this subspace name does not already exist
    const existingSubspaceNames: ReadonlySet<string> = subspacesConfiguration.subspaceNames;
    const newSubspaceName: string = this._subspaceNameParameter.value;
    if (existingSubspaceNames.has(newSubspaceName)) {
      throw new Error(
        `The subspace name: ${this._subspaceNameParameter.value} already exists in the subspace.json file.`
      );
    }
    if (
      SubspacesConfiguration.explainIfInvalidSubspaceName(
        newSubspaceName,
        this.rushConfiguration.subspacesConfiguration?.splitWorkspaceCompatibility
      )
    ) {
      return;
    }

    const subspaceConfigPath: string = `${this.rushConfiguration.commonFolder}/config/subspaces/${newSubspaceName}`;
    const defaultAssetsSubfolder: string = `${assetsFolderPath}/rush-init`;
    const userDefinedAssetsFolder: string | undefined = subspacesConfiguration.subspaceInitAssetsFolder
      ? `${this.rushConfiguration.rushJsonFolder}/${subspacesConfiguration.subspaceInitAssetsFolder}`
      : undefined;
    const templateFilePaths: string[] = [
      '[dot]npmrc',
      '.pnpmfile.cjs',
      'common-versions.json',
      'pnpm-config.json'
    ];

    await FileSystem.ensureEmptyFolderAsync(subspaceConfigPath);
    await Async.forEachAsync(
      templateFilePaths,
      async (templateFilePath) => {
        const defaultAssetSourcePath: string = `${defaultAssetsSubfolder}/common/config/rush/${templateFilePath}`;
        const destinationPath: string = `${subspaceConfigPath}/${templateFilePath.replace('[dot]', '.')}`;
        await copyTemplateFileAsync(defaultAssetSourcePath, destinationPath, true);
        if (userDefinedAssetsFolder) {
          // if user provided their own assets file for subspace initiation
          // we just copy and overwrite the default files
          await copyTemplateFileAsync(userDefinedAssetsFolder, destinationPath, true);
        }
      },
      { concurrency: 10 }
    );

    // Add the subspace name to subspaces.json
    const subspaceJson: ISubspacesConfigurationJson = await JsonFile.loadAsync(
      subspacesConfiguration.subspaceJsonFilePath
    );
    subspaceJson.subspaceNames.push(newSubspaceName);
    await JsonFile.saveAsync(subspaceJson, subspacesConfiguration.subspaceJsonFilePath, {
      updateExistingFile: true
    });

    terminal.writeLine(
      '\nSubspace successfully created. Please review the subspace configuration files before committing.'
    );
  }
}
