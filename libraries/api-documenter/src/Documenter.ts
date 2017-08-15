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

import {
  IDomPage,
  IDomTable,
  IDomTableRow,
  DomBasicText
} from './SimpleDom';

import { ApiJsonFile } from './ApiJsonFile';
import { BasePageRenderer } from './BasePageRenderer';
import { RenderingHelpers } from './RenderingHelpers';
import { Domifier } from './Domifier';

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

    const unscopedPackageName: string = RenderingHelpers.getUnscopedPackageName(apiJsonFile.packageName);

    const docPackage: IDocPackage = apiJsonFile.docPackage;

    const domPage: IDomPage = {
      kind: 'page',
      title: `${unscopedPackageName} package`,
      docId: RenderingHelpers.getDocId(apiJsonFile.packageName),
      elements: []
    };

    domPage.elements.push(...Domifier.renderDocElements(apiJsonFile.docPackage.summary));

    const classesTable: IDomTable = Domifier.createTable([
      Domifier.createTextElements('Class'),
      Domifier.createTextElements('Description')
    ]);

    const interfacesTable: IDomTable = Domifier.createTable([
      Domifier.createTextElements('Interface'),
      Domifier.createTextElements('Description')
    ]);

    for (const exportName of Object.keys(docPackage.exports)) {
      const docItem: IDocItem = docPackage.exports[exportName];

      const itemName: DomBasicText[] =
        [ Domifier.createDocLink(exportName, RenderingHelpers.getDocId(apiJsonFile.packageName, exportName)) ];

      switch (docItem.kind) {
        case 'class':
          classesTable.rows.push(
            Domifier.createTableRow([
              itemName,
              Domifier.renderDocElements(docItem.summary)
            ])
          );
          break;
        case 'interface':
          interfacesTable.rows.push(
            Domifier.createTableRow([
              itemName,
              Domifier.renderDocElements(docItem.summary)
            ])
          );
          break;
      }
    }

    if (classesTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Classes'));
      domPage.elements.push(classesTable);
    }

    if (interfacesTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Interfaces'));
      domPage.elements.push(interfacesTable);
    }

    renderer.writePage(domPage);
  }

}
