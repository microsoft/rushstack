// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import yaml = require('js-yaml');
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';

import {
  IApiClass,
  IApiEnum,
  IApiEnumMember,
  IApiFunction,
  IApiInterface,
  IApiPackage,
  ApiMember,
  IApiProperty,
  ApiItem,
  IApiParameter,
  IApiMethod,
  IMarkupPage,
  IMarkupTable,
  MarkupBasicElement,
  MarkupStructuredElement
} from '@microsoft/api-extractor';

import { DocItemSet, DocItem, DocItemKind, IDocItemSetResolveResult } from '../DocItemSet';
import { RenderingHelpers } from '../RenderingHelpers';
import { MarkupBuilder } from '../MarkupBuilder';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from '../MarkdownRenderer';

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownGenerator {
  private _docItemSet: DocItemSet;
  private _outputFolder: string;

  public constructor(docItemSet: DocItemSet) {
    this._docItemSet = docItemSet;
  }

  public generateFiles(outputFolder: string): void {
    this._outputFolder = outputFolder;

    console.log();
    this._deleteOldOutputFiles();

    for (const docPackage of this._docItemSet.docPackages) {
      this._writePackagePage(docPackage);
    }

  }

  /**
   * GENERATE PAGE: PACKAGE
   */
  private _writePackagePage(docPackage: DocItem): void {
    console.log(`Writing ${docPackage.name} package`);

    const unscopedPackageName: string = RenderingHelpers.getUnscopedPackageName(docPackage.name);

    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${unscopedPackageName} package`);
    // this._writeBreadcrumb(markupPage, docPackage);

    const apiPackage: IApiPackage = docPackage.apiItem as IApiPackage;

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiPackage.summary));

    const classesTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Class'),
      MarkupBuilder.createTextElements('Description')
    ]);

    const interfacesTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Interface'),
      MarkupBuilder.createTextElements('Description')
    ]);

    const functionsTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Function'),
      MarkupBuilder.createTextElements('Returns'),
      MarkupBuilder.createTextElements('Description')
    ]);

    const enumerationsTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Enumeration'),
      MarkupBuilder.createTextElements('Description')
    ]);

    for (const docItem of docPackage.children) {
      const apiItem: ApiItem = docItem.apiItem;

      const docItemTitle: MarkupBasicElement[] = [
        MarkupBuilder.createApiLink(
          [ MarkupBuilder.createCode(docItem.name, 'javascript') ],
          docItem.getApiReference())
      ];

      const docItemDescription: MarkupBasicElement[] = [];

      if (apiItem.isBeta) {
        docItemDescription.push(...MarkupBuilder.createTextElements('(BETA)', { italics: true, bold: true }));
        docItemDescription.push(...MarkupBuilder.createTextElements(' '));
      }
      docItemDescription.push(...MarkupBuilder.renderDocElements(apiItem.summary));

      switch (apiItem.kind) {
        case 'class':
          classesTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          // this._writeClassPage(docItem, exportNode, renderer);
          break;
        case 'interface':
          interfacesTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          // this._writeInterfacePage(docItem, exportNode, renderer);
          break;
        case 'function':
          functionsTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              apiItem.returnValue ? [MarkupBuilder.createCode(apiItem.returnValue.type, 'javascript')] : [],
              docItemDescription
            ])
          );
          // this._writeFunctionPage(docItem, exportNode, renderer);
          break;
        case 'enum':
          enumerationsTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          // this._writeEnumPage(docItem, exportNode, renderer);
          break;
      }
    }
    this._writePage(markupPage, docPackage);
  }

  private _writePage(markupPage: IMarkupPage, docItem): void { // override
    const filename: string = path.join(this._outputFolder, this._getFilenameForDocItem(docItem));

    const content: string = MarkdownRenderer.renderElements([markupPage], {
      onRenderApiLink: (args: IMarkdownRenderApiLinkArgs) => {
        const resolveResult: IDocItemSetResolveResult = this._docItemSet.resolveApiItemReference(args.reference);
        if (!resolveResult.docItem) {
          throw new Error('Unresolved: ' + JSON.stringify(args.reference));
        }

        const docFilename: string = this._getFilenameForDocItem(resolveResult.docItem);
        args.prefix = '[';
        args.suffix = '](' + docFilename + ')';
      }
    });

    fsx.writeFileSync(filename, content);
  }

  private _getFilenameForDocItem(docItem: DocItem): string {
    let baseName: string = '';
    for (const part of docItem.getHierarchy()) {
      if (part.kind == DocItemKind.Package) {
        baseName = RenderingHelpers.getUnscopedPackageName(part.name);
      } else {
        baseName += '.' + part.name;
      }
    }
    return baseName.toLowerCase() + '.md';
  }

  private _deleteOldOutputFiles(): void {
    console.log('Deleting old output from ' + this._outputFolder);
    fsx.emptyDirSync(this._outputFolder);
  }
}
