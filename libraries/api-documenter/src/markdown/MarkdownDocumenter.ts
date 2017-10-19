// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

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
    this._writeBreadcrumb(markupPage, docPackage);

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

    for (const docChild of docPackage.children) {
      const apiChild: ApiItem = docChild.apiItem;

      const docItemTitle: MarkupBasicElement[] = [
        MarkupBuilder.createApiLink(
          [ MarkupBuilder.createCode(docChild.name, 'javascript') ],
          docChild.getApiReference())
      ];

      const docChildDescription: MarkupBasicElement[] = [];

      if (apiChild.isBeta) {
        docChildDescription.push(...MarkupBuilder.createTextElements('(BETA)', { italics: true, bold: true }));
        docChildDescription.push(...MarkupBuilder.createTextElements(' '));
      }
      docChildDescription.push(...MarkupBuilder.renderDocElements(apiChild.summary));

      switch (apiChild.kind) {
        case 'class':
          classesTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeClassPage(docChild);
          break;
        case 'interface':
          interfacesTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeInterfacePage(docChild);
          break;
        case 'function':
          functionsTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              apiChild.returnValue ? [MarkupBuilder.createCode(apiChild.returnValue.type, 'javascript')] : [],
              docChildDescription
            ])
          );
          this._writeFunctionPage(docChild);
          break;
        case 'enum':
          enumerationsTable.rows.push(
            MarkupBuilder.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeEnumPage(docChild);
          break;
      }
    }

    if (apiPackage.remarks && apiPackage.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiPackage.remarks));
    }

    if (classesTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Classes'));
      markupPage.elements.push(classesTable);
    }

    if (interfacesTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Interfaces'));
      markupPage.elements.push(interfacesTable);
    }

    if (functionsTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Functions'));
      markupPage.elements.push(functionsTable);
    }

    if (enumerationsTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Enumerations'));
      markupPage.elements.push(enumerationsTable);
    }

    this._writePage(markupPage, docPackage);
  }

  /**
   * GENERATE PAGE: CLASS
   */
  private _writeClassPage(docClass: DocItem): void {
    const apiClass: IApiClass = docClass.apiItem as IApiClass;

    // TODO: Show concise generic parameters with class name
    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${docClass.name} class`);
    this._writeBreadcrumb(markupPage, docClass);

    if (apiClass.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiClass.summary));

    const propertiesTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Property'),
      MarkupBuilder.createTextElements('Access Modifier'),
      MarkupBuilder.createTextElements('Type'),
      MarkupBuilder.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Method'),
      MarkupBuilder.createTextElements('Access Modifier'),
      MarkupBuilder.createTextElements('Returns'),
      MarkupBuilder.createTextElements('Description')
    ]);

    for (const docMember of docClass.children) {
      const apiMember: ApiMember = docMember.apiItem as ApiMember;

      switch (apiMember.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            MarkupBuilder.createApiLink(
              [MarkupBuilder.createCode(docMember.name, 'javascript')],
              docMember.getApiReference())
          ];

          propertiesTable.rows.push(
            MarkupBuilder.createTableRow([
              propertyTitle,
              [],
              [MarkupBuilder.createCode(apiMember.type, 'javascript')],
              MarkupBuilder.renderDocElements(apiMember.summary)
            ])
          );
          this._writePropertyPage(docMember);
          break;

        case 'constructor':
          // TODO: Extract constructor into its own section
          const constructorTitle: MarkupBasicElement[] = [
            MarkupBuilder.createApiLink(
              [MarkupBuilder.createCode(RenderingHelpers.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            MarkupBuilder.createTableRow([
              constructorTitle,
              [],
              [],
              MarkupBuilder.renderDocElements(apiMember.summary)
            ])
          );
          this._writeMethodPage(docMember);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            MarkupBuilder.createApiLink(
              [MarkupBuilder.createCode(RenderingHelpers.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            MarkupBuilder.createTableRow([
              methodTitle,
              apiMember.accessModifier ? [MarkupBuilder.createCode(apiMember.accessModifier, 'javascript')] : [],
              apiMember.returnValue ? [MarkupBuilder.createCode(apiMember.returnValue.type, 'javascript')] : [],
              MarkupBuilder.renderDocElements(apiMember.summary)
            ])
          );
          this._writeMethodPage(docMember);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Properties'));
      markupPage.elements.push(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Methods'));
      markupPage.elements.push(methodsTable);
    }

    if (apiClass.remarks && apiClass.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiClass.remarks));
    }

    this._writePage(markupPage, docClass);
  }

  /**
   * GENERATE PAGE: INTERFACE
   */
  private _writeInterfacePage(docInterface: DocItem): void {
    const apiInterface: IApiInterface = docInterface.apiItem as IApiInterface;

    // TODO: Show concise generic parameters with class name
    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${docInterface.name} interface`);
    this._writeBreadcrumb(markupPage, docInterface);

    if (apiInterface.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiInterface.summary));

    const propertiesTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Property'),
      MarkupBuilder.createTextElements('Type'),
      MarkupBuilder.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Method'),
      MarkupBuilder.createTextElements('Returns'),
      MarkupBuilder.createTextElements('Description')
    ]);

    for (const docMember of docInterface.children) {
      const apiMember: ApiMember = docMember.apiItem as ApiMember;

      switch (apiMember.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            MarkupBuilder.createApiLink(
              [MarkupBuilder.createCode(docMember.name, 'javascript')],
              docMember.getApiReference())
          ];

          propertiesTable.rows.push(
            MarkupBuilder.createTableRow([
              propertyTitle,
              [MarkupBuilder.createCode(apiMember.type)],
              MarkupBuilder.renderDocElements(apiMember.summary)
            ])
          );
          this._writePropertyPage(docMember);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            MarkupBuilder.createApiLink(
              [MarkupBuilder.createCode(RenderingHelpers.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            MarkupBuilder.createTableRow([
              methodTitle,
              apiMember.returnValue ? [MarkupBuilder.createCode(apiMember.returnValue.type, 'javascript')] : [],
              MarkupBuilder.renderDocElements(apiMember.summary)
            ])
          );
          this._writeMethodPage(docMember);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Properties'));
      markupPage.elements.push(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Methods'));
      markupPage.elements.push(methodsTable);
    }

    if (apiInterface.remarks && apiInterface.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiInterface.remarks));
    }

    this._writePage(markupPage, docInterface);
  }

  /**
   * GENERATE PAGE: ENUM
   */
  private _writeEnumPage(docEnum: DocItem): void {
    const apiEnum: IApiEnum = docEnum.apiItem as IApiEnum;

    // TODO: Show concise generic parameters with class name
    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${docEnum.name} enumeration`);
    this._writeBreadcrumb(markupPage, docEnum);

    if (apiEnum.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiEnum.summary));

    const membersTable: IMarkupTable = MarkupBuilder.createTable([
      MarkupBuilder.createTextElements('Member'),
      MarkupBuilder.createTextElements('Value'),
      MarkupBuilder.createTextElements('Description')
    ]);

    for (const docEnumMember of docEnum.children) {
      const apiEnumMember: IApiEnumMember = docEnumMember.apiItem as IApiEnumMember;

      const enumValue: MarkupBasicElement[] = [];

      if (apiEnumMember.value) {
        enumValue.push(MarkupBuilder.createCode('= ' + apiEnumMember.value));
      }

      membersTable.rows.push(
        MarkupBuilder.createTableRow([
          MarkupBuilder.createTextElements(docEnumMember.name),
          enumValue,
          MarkupBuilder.renderDocElements(apiEnumMember.summary)
        ])
      );
    }

    if (membersTable.rows.length > 0) {
      markupPage.elements.push(membersTable);
    }

    this._writePage(markupPage, docEnum);
  }

  /**
   * GENERATE PAGE: PROPERTY
   */
  private _writePropertyPage(docProperty: DocItem): void {
    const apiProperty: IApiProperty = docProperty.apiItem as IApiProperty;
    const fullProperyName: string = docProperty.parent!.name + '.' + docProperty.name;

    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${fullProperyName} property`);
    this._writeBreadcrumb(markupPage, docProperty);

    if (apiProperty.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiProperty.summary));

    markupPage.elements.push(MarkupBuilder.PARAGRAPH);
    markupPage.elements.push(...MarkupBuilder.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(MarkupBuilder.createCodeBox(docProperty.name + ': ' + apiProperty.type, 'javascript'));

    if (apiProperty.remarks && apiProperty.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiProperty.remarks));
    }

    this._writePage(markupPage, docProperty);
  }

  /**
   * GENERATE PAGE: METHOD
   */
  private _writeMethodPage(docMethod: DocItem): void {
    const apiMethod: IApiMethod = docMethod.apiItem as IApiMethod;

    const fullMethodName: string = docMethod.parent!.name + '.' + docMethod.name;

    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${fullMethodName} method`);
    this._writeBreadcrumb(markupPage, docMethod);

    if (apiMethod.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiMethod.summary));

    markupPage.elements.push(MarkupBuilder.PARAGRAPH);
    markupPage.elements.push(...MarkupBuilder.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(MarkupBuilder.createCodeBox(apiMethod.signature, 'javascript'));

    if (apiMethod.returnValue) {
      markupPage.elements.push(...MarkupBuilder.createTextElements('Returns:', { bold: true }));
      markupPage.elements.push(...MarkupBuilder.createTextElements(' '));
      markupPage.elements.push(MarkupBuilder.createCode(apiMethod.returnValue.type, 'javascript'));
      markupPage.elements.push(MarkupBuilder.PARAGRAPH);
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiMethod.returnValue.description));
    }

    if (apiMethod.remarks && apiMethod.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiMethod.remarks));
    }

    if (Object.keys(apiMethod.parameters).length > 0) {
      const parametersTable: IMarkupTable = MarkupBuilder.createTable([
        MarkupBuilder.createTextElements('Parameter'),
        MarkupBuilder.createTextElements('Type'),
        MarkupBuilder.createTextElements('Description')
      ]);

      markupPage.elements.push(MarkupBuilder.createHeading1('Parameters'));
      markupPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(apiMethod.parameters)) {
        const apiParameter: IApiParameter = apiMethod.parameters[parameterName];
          parametersTable.rows.push(MarkupBuilder.createTableRow([
            [MarkupBuilder.createCode(parameterName, 'javascript')],
            apiParameter.type ? [MarkupBuilder.createCode(apiParameter.type, 'javascript')] : [],
            MarkupBuilder.renderDocElements(apiParameter.description)
          ])
        );
      }
    }

    this._writePage(markupPage, docMethod);
  }

  /**
   * GENERATE PAGE: FUNCTION
   */
  private _writeFunctionPage(docFunction: DocItem): void {
    const apiFunction: IApiFunction = docFunction.apiItem as IApiFunction;

    const markupPage: IMarkupPage = MarkupBuilder.createPage(`${docFunction.name} function`);
    this._writeBreadcrumb(markupPage, docFunction);

    if (apiFunction.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...MarkupBuilder.renderDocElements(apiFunction.summary));

    markupPage.elements.push(MarkupBuilder.PARAGRAPH);
    markupPage.elements.push(...MarkupBuilder.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(MarkupBuilder.createCodeBox(docFunction.name, 'javascript'));

    if (apiFunction.returnValue) {
      markupPage.elements.push(...MarkupBuilder.createTextElements('Returns:', { bold: true }));
      markupPage.elements.push(...MarkupBuilder.createTextElements(' '));
      markupPage.elements.push(MarkupBuilder.createCode(apiFunction.returnValue.type, 'javascript'));
      markupPage.elements.push(MarkupBuilder.PARAGRAPH);
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiFunction.returnValue.description));
    }

    if (apiFunction.remarks && apiFunction.remarks.length) {
      markupPage.elements.push(MarkupBuilder.createHeading1('Remarks'));
      markupPage.elements.push(...MarkupBuilder.renderDocElements(apiFunction.remarks));
    }

    if (Object.keys(apiFunction.parameters).length > 0) {
      const parametersTable: IMarkupTable = MarkupBuilder.createTable([
        MarkupBuilder.createTextElements('Parameter'),
        MarkupBuilder.createTextElements('Type'),
        MarkupBuilder.createTextElements('Description')
      ]);

      markupPage.elements.push(MarkupBuilder.createHeading1('Parameters'));
      markupPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(apiFunction.parameters)) {
        const apiParameter: IApiParameter = apiFunction.parameters[parameterName];
          parametersTable.rows.push(MarkupBuilder.createTableRow([
            [MarkupBuilder.createCode(parameterName, 'javascript')],
            apiParameter.type ? [MarkupBuilder.createCode(apiParameter.type, 'javascript')] : [],
            MarkupBuilder.renderDocElements(apiParameter.description)
          ])
        );
      }
    }

    this._writePage(markupPage, docFunction);
  }

  private _writeBreadcrumb(markupPage: IMarkupPage, docItem: DocItem): void {
    markupPage.breadcrumb.push(MarkupBuilder.createWebLinkFromText('Home', './index'));

    for (const hierarchyItem of docItem.getHierarchy()) {
      markupPage.breadcrumb.push(...MarkupBuilder.createTextElements(' > '));
      markupPage.breadcrumb.push(MarkupBuilder.createApiLinkFromText(
        hierarchyItem.name, hierarchyItem.getApiReference()));
    }
  }

  private _writeBetaWarning(elements: MarkupStructuredElement[]): void {
    const betaWarning: string = 'This API is provided as a preview for developers and may change'
      + ' based on feedback that we receive.  Do not use this API in a production environment.';
    elements.push(
      MarkupBuilder.createNoteBoxFromText(betaWarning)
    );
  }

  private _writePage(markupPage: IMarkupPage, docItem: DocItem): void { // override
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
      if (part.kind === DocItemKind.Package) {
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
