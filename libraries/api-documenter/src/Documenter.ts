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

import { IDomPage } from './SimpleDom';

import { ApiJsonFile } from './ApiJsonFile';
import { BasePageRenderer } from './BasePageRenderer';

export class Documenter {
  private readonly _apiJsonFiles: ApiJsonFile[] = [];
  private _outputFolder: string;

  public loadApiJsonFile(apiJsonFilePath: string): void {
    this._apiJsonFiles.push(ApiJsonFile.loadFromFile(apiJsonFilePath));
  }

  public writeDocs(outputFolder: string, renderer: BasePageRenderer): void {
    this._outputFolder = outputFolder;

    console.log(os.EOL + `Deleting old *${renderer.outputFileExtension} files...` + os.EOL);
    renderer.deleteOutputFiles();

    for (const apiJsonFile of this._apiJsonFiles) {
      this._writePackagePage(apiJsonFile, renderer);
    }
  }

  private _writePackagePage(apiJsonFile: ApiJsonFile, renderer: BasePageRenderer): void {
    console.log(`Writing ${apiJsonFile.packageName} package`);

    const domPage: IDomPage = {
      kind: 'page',
      title: 'Test',
      docId: 'test',
      elements: []
    };

    renderer.writePage(domPage);

  }

}
