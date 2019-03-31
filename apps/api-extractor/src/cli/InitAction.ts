// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import { FileSystem } from '@microsoft/node-core-library';
import { CommandLineAction } from '@microsoft/ts-command-line';

import { ApiExtractorCommandLine } from './ApiExtractorCommandLine';

const AE_CONFIG_FILENAME: string = 'api-extractor.json';

export class InitAction extends CommandLineAction {

  constructor(parser: ApiExtractorCommandLine) {
    super({
      actionName: 'init',
      summary: `Create an ${AE_CONFIG_FILENAME} config file`,
      documentation: `Use this command when setting up API Extractor for a new project.  It writes an`
        + ` ${AE_CONFIG_FILENAME} config file template with code comments that describe all the settings.`
        + ` The file will be written in the current directory.`
    });
  }

  protected onDefineParameters(): void { // override
    // No parameters yet
  }

  protected onExecute(): Promise<void> { // override
    const inputFilePath: string = path.resolve(__dirname, '../schemas/api-extractor-template.json');
    const outputFilePath: string = path.resolve(AE_CONFIG_FILENAME);

    if (FileSystem.exists(outputFilePath)) {
      console.log(colors.red('The output file already exists:'));
      console.log('\n  ' + outputFilePath + '\n');
      throw new Error('Unable to write output file');
    }

    console.log(colors.green('Writing file: ') + outputFilePath);
    FileSystem.copyFile({
      sourcePath: inputFilePath,
      destinationPath: outputFilePath
    });

    console.log('\nThe recommended location for this file is in the project\'s "config" subfolder,\n'
      + 'or else in the top-level folder with package.json.');

    return Promise.resolve();
  }
}
