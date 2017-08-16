// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';

import {
  IDocClass,
  IDocPackage,
  IDocMember,
  IDocItem
} from '@microsoft/api-extractor/lib/IDocItem';

import {
  IDomPage,
  IDomTable,
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

    const domPage: IDomPage = Domifier.createPage(`${unscopedPackageName} package`,
      RenderingHelpers.getDocId(apiJsonFile.packageName));

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

      const docItemTitle: DomBasicText[] = [
        Domifier.createDocLink(
          [ Domifier.createCode(exportName, 'javascript') ],
          RenderingHelpers.getDocId(apiJsonFile.packageName, exportName))
      ];

      switch (docItem.kind) {
        case 'class':
          classesTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              Domifier.renderDocElements(docItem.summary)
            ])
          );
          this._writeClassPage(docItem, exportName, apiJsonFile, renderer);
          break;
        case 'interface':
          interfacesTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              Domifier.renderDocElements(docItem.summary)
            ])
          );
          break;
      }
    }

    if (docPackage.remarks && docPackage.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docPackage.remarks));
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

  private _writeClassPage(docClass: IDocClass, className: string, apiJsonFile: ApiJsonFile,
    renderer: BasePageRenderer): void {

    // TODO: Show concise generic parameters with class name
    const domPage: IDomPage = Domifier.createPage(`${className} class`,
      RenderingHelpers.getDocId(apiJsonFile.packageName, className));

    domPage.elements.push(...Domifier.renderDocElements(apiJsonFile.docPackage.summary));

    domPage.elements.push(Domifier.createHeading1('Constructor'));

    // TODO: pending WBT fix
    domPage.elements.push(...Domifier.createTextElements('Constructs a new instance of the '));
    domPage.elements.push(Domifier.createCode(className));
    domPage.elements.push(...Domifier.createTextElements(' class'));

    const methodsTable: IDomTable = Domifier.createTable([
      Domifier.createTextElements('Method'),
      Domifier.createTextElements('Access Modifier'),
      Domifier.createTextElements('Returns'),
      Domifier.createTextElements('Description')
    ]);

    for (const memberName of Object.keys(docClass.members)) {
      const member: IDocMember = docClass.members[memberName];
      switch (member.kind) {
        case 'method':
          const methodTitle: DomBasicText[] = [
            Domifier.createDocLink(
              [Domifier.createCode(RenderingHelpers.getConciseSignature(memberName, member), 'javascript')],
              RenderingHelpers.getDocId(apiJsonFile.packageName, className, memberName))
          ];

          methodsTable.rows.push(
            Domifier.createTableRow([
              methodTitle,
              [Domifier.createCode(member.accessModifier ? member.accessModifier.toString() : '', 'javascript')],
              [Domifier.createCode(member.returnValue ? member.returnValue.type : '', 'javascript')],
              Domifier.renderDocElements(member.summary)
            ])
          );
          break;
      }
    }

    if (methodsTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Methods'));
      domPage.elements.push(methodsTable);
    }

    if (docClass.remarks && docClass.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docClass.remarks));
    }

    renderer.writePage(domPage);
  }

}
