// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';

import { ExperimentYamlDocumenter } from '../documenters/ExperimentYamlDocumenter';
import { ApiModel } from '@microsoft/api-extractor-model';
import { DocumenterConfig } from '../documenters/DocumenterConfig';
import { FileSystem } from '@microsoft/node-core-library';
import { IConfigFile } from '../documenters/IConfigFile';

export class GenerateAction extends BaseAction {
  constructor(parser: ApiDocumenterCommandLine) {
    super({
      actionName: 'generate',
      summary: 'EXPERIMENTAL',
      documentation: 'EXPERIMENTAL - This action is a prototype of a new config file driven mode of operation for'
        + ' API Documenter.  It is not ready for general usage yet.  Its design may change in the future.'
    });
  }

  protected onDefineParameters(): void { // override
    super.onDefineParameters();
  }

  protected onExecute(): Promise<void> { // override
    // Look for the config file under the current folder

    let configFilePath: string = path.join(process.cwd(), DocumenterConfig.FILENAME);

    // First try the current folder
    if (!FileSystem.exists(configFilePath)) {
      // Otherwise try the standard "config" subfolder
      configFilePath = path.join(process.cwd(), 'config', DocumenterConfig.FILENAME);
      if (!FileSystem.exists(configFilePath)) {
        throw new Error(`Unable to find ${DocumenterConfig.FILENAME} in the current folder or in a "config" subfolder`);
      }
    }

    const configFile: IConfigFile = DocumenterConfig.loadFile(configFilePath);

    const apiModel: ApiModel = this.buildApiModel();

    const yamlDocumenter: ExperimentYamlDocumenter = new ExperimentYamlDocumenter(apiModel, configFile);
    yamlDocumenter.generateFiles(this.outputFolder);
    return Promise.resolve();
  }
}
