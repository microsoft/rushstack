// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

import {
  CommandLineAction,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';

import { DocItemSet } from '../utils/DocItemSet';

export abstract class BaseAction extends CommandLineAction {
  protected inputFolder: string;
  protected outputFolder: string;

  private _inputFolderParameter: CommandLineStringParameter;
  private _outputFolderParameter: CommandLineStringParameter;

  protected onDefineParameters(): void { // override
    this._inputFolderParameter = this.defineStringParameter({
      parameterLongName: '--input-folder',
      parameterShortName: '-i',
      argumentName: 'FOLDER1',
      description: `Specifies the input folder containing the *.api.json files to be processed.`
        + ` If omitted, the default is "./input"`
    });

    this._outputFolderParameter = this.defineStringParameter({
      parameterLongName: '--output-folder',
      parameterShortName: '-o',
      argumentName: 'FOLDER2',
      description: `Specifies the output folder where the documentation will be written.`
        + ` ANY EXISTING CONTENTS WILL BE DELETED!`
        + ` If omitted, the default is "./${this.actionName}"`
    });
  }

  protected buildDocItemSet(): DocItemSet {
    const docItemSet: DocItemSet = new DocItemSet();

    this.inputFolder = this._inputFolderParameter.value || './input';
    if (!fsx.existsSync(this.inputFolder)) {
      throw new Error('The input folder does not exist: ' + this.inputFolder);
    }

    this.outputFolder = this._outputFolderParameter.value || `./${this.actionName}`;
    fsx.mkdirsSync(this.outputFolder);

    for (const filename of fsx.readdirSync(this.inputFolder)) {
      if (filename.match(/\.api\.json$/i)) {
        console.log(`Reading ${filename}`);
        const filenamePath: string = path.join(this.inputFolder, filename);
        docItemSet.loadApiJsonFile(filenamePath);
      }
    }

    return docItemSet;
  }
}
