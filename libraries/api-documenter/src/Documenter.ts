// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';

import {
  IDocClass,
  IDocPackage,
  IDocMember,
  IDocMethod,
  IDocItem
} from '@microsoft/api-extractor/lib/IDocItem';

import { ApiJsonFile } from './ApiJsonFile';
import { BaseRenderer, BasePage } from './BaseRenderer';

export class Documenter {
  private readonly _apiJsonFiles: ApiJsonFile[] = [];
  private _outputFolder: string;

  public loadApiJsonFile(apiJsonFilePath: string): void {
    this._apiJsonFiles.push(ApiJsonFile.loadFromFile(apiJsonFilePath));
  }

  public writeDocs(outputFolder: string, renderer: BaseRenderer): void {
    this._outputFolder = outputFolder;

    console.log(os.EOL + `Deleting old *${renderer.outputFileExtension} files...` + os.EOL);
    renderer.deleteOutputFiles();

    const page: BasePage = renderer.createPage('test');
    page.writeToFile();
  }
}
