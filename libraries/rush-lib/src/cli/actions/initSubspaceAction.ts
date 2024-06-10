// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import { assetsFolderPath } from '../../utilities/PathConstants';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { ISubspacesConfigurationJson, SubspacesConfiguration } from '../../api/SubspacesConfiguration';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

const SUBSPACE_TEMPLATE_FOLDER_PATH: string = `${assetsFolderPath}/rush-init-subspace`;

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
      throw new Error('The subspaces feature must be enabled to create a new subspace.');
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

    await FileSystem.ensureEmptyFolderAsync(subspaceConfigPath);
    await FileSystem.copyFilesAsync({
      sourcePath: SUBSPACE_TEMPLATE_FOLDER_PATH,
      destinationPath: subspaceConfigPath
    });

    // Add the subspace name to subspaces.json
    const subspaceJson: ISubspacesConfigurationJson = await JsonFile.loadAsync(
      subspacesConfiguration.subspaceJsonFilePath
    );
    subspaceJson.subspaceNames.push(newSubspaceName);
    await JsonFile.saveAsync(subspaceJson, subspacesConfiguration.subspaceJsonFilePath, {
      updateExistingFile: true
    });

    // eslint-disable-next-line no-console
    terminal.writeLine(
      '\nSubspace successfully created. Please review the subspace configuration files before committing.'
    );
  }
}
