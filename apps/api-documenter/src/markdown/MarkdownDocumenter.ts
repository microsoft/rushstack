// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

import { Text, PackageName } from '@microsoft/node-core-library';
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
  Markup,
  MarkupBasicElement,
  MarkupStructuredElement
} from '@microsoft/api-extractor';

import {
  DocItemSet,
  DocItem,
  DocItemKind,
  IDocItemSetResolveResult
} from '../utils/DocItemSet';
import { Utilities } from '../utils/Utilities';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from '../utils/MarkdownRenderer';

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownDocumenter {
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

    const unscopedPackageName: string = PackageName.getUnscopedName(docPackage.name);

    const markupPage: IMarkupPage = Markup.createPage(`${unscopedPackageName} package`);
    this._writeBreadcrumb(markupPage, docPackage);

    const apiPackage: IApiPackage = docPackage.apiItem as IApiPackage;

    markupPage.elements.push(...apiPackage.summary);

    const classesTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Class'),
      Markup.createTextElements('Description')
    ]);

    const interfacesTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Interface'),
      Markup.createTextElements('Description')
    ]);

    const functionsTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Function'),
      Markup.createTextElements('Returns'),
      Markup.createTextElements('Description')
    ]);

    const enumerationsTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Enumeration'),
      Markup.createTextElements('Description')
    ]);

    for (const docChild of docPackage.children) {
      const apiChild: ApiItem = docChild.apiItem;

      const docItemTitle: MarkupBasicElement[] = [
        Markup.createApiLink(
          [ Markup.createCode(docChild.name, 'javascript') ],
          docChild.getApiReference())
      ];

      const docChildDescription: MarkupBasicElement[] = [];

      if (apiChild.isBeta) {
        docChildDescription.push(...Markup.createTextElements('(BETA)', { italics: true, bold: true }));
        docChildDescription.push(...Markup.createTextElements(' '));
      }
      docChildDescription.push(...apiChild.summary);

      switch (apiChild.kind) {
        case 'class':
          classesTable.rows.push(
            Markup.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeClassPage(docChild);
          break;
        case 'interface':
          interfacesTable.rows.push(
            Markup.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeInterfacePage(docChild);
          break;
        case 'function':
          functionsTable.rows.push(
            Markup.createTableRow([
              docItemTitle,
              apiChild.returnValue ? [Markup.createCode(apiChild.returnValue.type, 'javascript')] : [],
              docChildDescription
            ])
          );
          this._writeFunctionPage(docChild);
          break;
        case 'enum':
          enumerationsTable.rows.push(
            Markup.createTableRow([
              docItemTitle,
              docChildDescription
            ])
          );
          this._writeEnumPage(docChild);
          break;
      }
    }

    if (apiPackage.remarks && apiPackage.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiPackage.remarks);
    }

    if (classesTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Classes'));
      markupPage.elements.push(classesTable);
    }

    if (interfacesTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Interfaces'));
      markupPage.elements.push(interfacesTable);
    }

    if (functionsTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Functions'));
      markupPage.elements.push(functionsTable);
    }

    if (enumerationsTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Enumerations'));
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
    const markupPage: IMarkupPage = Markup.createPage(`${docClass.name} class`);
    this._writeBreadcrumb(markupPage, docClass);

    if (apiClass.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiClass.summary);

    const propertiesTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Property'),
      Markup.createTextElements('Access Modifier'),
      Markup.createTextElements('Type'),
      Markup.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Method'),
      Markup.createTextElements('Access Modifier'),
      Markup.createTextElements('Returns'),
      Markup.createTextElements('Description')
    ]);

    for (const docMember of docClass.children) {
      const apiMember: ApiMember = docMember.apiItem as ApiMember;

      switch (apiMember.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            Markup.createApiLink(
              [Markup.createCode(docMember.name, 'javascript')],
              docMember.getApiReference())
          ];

          propertiesTable.rows.push(
            Markup.createTableRow([
              propertyTitle,
              [],
              [Markup.createCode(apiMember.type, 'javascript')],
              apiMember.summary
            ])
          );
          this._writePropertyPage(docMember);
          break;

        case 'constructor':
          // TODO: Extract constructor into its own section
          const constructorTitle: MarkupBasicElement[] = [
            Markup.createApiLink(
              [Markup.createCode(Utilities.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            Markup.createTableRow([
              constructorTitle,
              [],
              [],
              apiMember.summary
            ])
          );
          this._writeMethodPage(docMember);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            Markup.createApiLink(
              [Markup.createCode(Utilities.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            Markup.createTableRow([
              methodTitle,
              apiMember.accessModifier ? [Markup.createCode(apiMember.accessModifier, 'javascript')] : [],
              apiMember.returnValue ? [Markup.createCode(apiMember.returnValue.type, 'javascript')] : [],
              apiMember.summary
            ])
          );
          this._writeMethodPage(docMember);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Properties'));
      markupPage.elements.push(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Methods'));
      markupPage.elements.push(methodsTable);
    }

    if (apiClass.remarks && apiClass.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiClass.remarks);
    }

    this._writePage(markupPage, docClass);
  }

  /**
   * GENERATE PAGE: INTERFACE
   */
  private _writeInterfacePage(docInterface: DocItem): void {
    const apiInterface: IApiInterface = docInterface.apiItem as IApiInterface;

    // TODO: Show concise generic parameters with class name
    const markupPage: IMarkupPage = Markup.createPage(`${docInterface.name} interface`);
    this._writeBreadcrumb(markupPage, docInterface);

    if (apiInterface.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiInterface.summary);

    const propertiesTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Property'),
      Markup.createTextElements('Type'),
      Markup.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Method'),
      Markup.createTextElements('Returns'),
      Markup.createTextElements('Description')
    ]);

    for (const docMember of docInterface.children) {
      const apiMember: ApiMember = docMember.apiItem as ApiMember;

      switch (apiMember.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            Markup.createApiLink(
              [Markup.createCode(docMember.name, 'javascript')],
              docMember.getApiReference())
          ];

          propertiesTable.rows.push(
            Markup.createTableRow([
              propertyTitle,
              [Markup.createCode(apiMember.type)],
              apiMember.summary
            ])
          );
          this._writePropertyPage(docMember);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            Markup.createApiLink(
              [Markup.createCode(Utilities.getConciseSignature(docMember.name, apiMember), 'javascript')],
              docMember.getApiReference())
          ];

          methodsTable.rows.push(
            Markup.createTableRow([
              methodTitle,
              apiMember.returnValue ? [Markup.createCode(apiMember.returnValue.type, 'javascript')] : [],
              apiMember.summary
            ])
          );
          this._writeMethodPage(docMember);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Properties'));
      markupPage.elements.push(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      markupPage.elements.push(Markup.createHeading1('Methods'));
      markupPage.elements.push(methodsTable);
    }

    if (apiInterface.remarks && apiInterface.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiInterface.remarks);
    }

    this._writePage(markupPage, docInterface);
  }

  /**
   * GENERATE PAGE: ENUM
   */
  private _writeEnumPage(docEnum: DocItem): void {
    const apiEnum: IApiEnum = docEnum.apiItem as IApiEnum;

    // TODO: Show concise generic parameters with class name
    const markupPage: IMarkupPage = Markup.createPage(`${docEnum.name} enumeration`);
    this._writeBreadcrumb(markupPage, docEnum);

    if (apiEnum.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiEnum.summary);

    const membersTable: IMarkupTable = Markup.createTable([
      Markup.createTextElements('Member'),
      Markup.createTextElements('Value'),
      Markup.createTextElements('Description')
    ]);

    for (const docEnumMember of docEnum.children) {
      const apiEnumMember: IApiEnumMember = docEnumMember.apiItem as IApiEnumMember;

      const enumValue: MarkupBasicElement[] = [];

      if (apiEnumMember.value) {
        enumValue.push(Markup.createCode('= ' + apiEnumMember.value));
      }

      membersTable.rows.push(
        Markup.createTableRow([
          Markup.createTextElements(docEnumMember.name),
          enumValue,
          apiEnumMember.summary
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

    const markupPage: IMarkupPage = Markup.createPage(`${fullProperyName} property`);
    this._writeBreadcrumb(markupPage, docProperty);

    if (apiProperty.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiProperty.summary);

    markupPage.elements.push(Markup.PARAGRAPH);
    markupPage.elements.push(...Markup.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(Markup.createCodeBox(docProperty.name + ': ' + apiProperty.type, 'javascript'));

    if (apiProperty.remarks && apiProperty.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiProperty.remarks);
    }

    this._writePage(markupPage, docProperty);
  }

  /**
   * GENERATE PAGE: METHOD
   */
  private _writeMethodPage(docMethod: DocItem): void {
    const apiMethod: IApiMethod = docMethod.apiItem as IApiMethod;

    const fullMethodName: string = docMethod.parent!.name + '.' + docMethod.name;

    const markupPage: IMarkupPage = Markup.createPage(`${fullMethodName} method`);
    this._writeBreadcrumb(markupPage, docMethod);

    if (apiMethod.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiMethod.summary);

    markupPage.elements.push(Markup.PARAGRAPH);
    markupPage.elements.push(...Markup.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(Markup.createCodeBox(apiMethod.signature, 'javascript'));

    if (apiMethod.returnValue) {
      markupPage.elements.push(...Markup.createTextElements('Returns:', { bold: true }));
      markupPage.elements.push(...Markup.createTextElements(' '));
      markupPage.elements.push(Markup.createCode(apiMethod.returnValue.type, 'javascript'));
      markupPage.elements.push(Markup.PARAGRAPH);
      markupPage.elements.push(...apiMethod.returnValue.description);
    }

    if (apiMethod.remarks && apiMethod.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiMethod.remarks);
    }

    if (Object.keys(apiMethod.parameters).length > 0) {
      const parametersTable: IMarkupTable = Markup.createTable([
        Markup.createTextElements('Parameter'),
        Markup.createTextElements('Type'),
        Markup.createTextElements('Description')
      ]);

      markupPage.elements.push(Markup.createHeading1('Parameters'));
      markupPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(apiMethod.parameters)) {
        const apiParameter: IApiParameter = apiMethod.parameters[parameterName];
          parametersTable.rows.push(Markup.createTableRow([
            [Markup.createCode(parameterName, 'javascript')],
            apiParameter.type ? [Markup.createCode(apiParameter.type, 'javascript')] : [],
            apiParameter.description
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

    const markupPage: IMarkupPage = Markup.createPage(`${docFunction.name} function`);
    this._writeBreadcrumb(markupPage, docFunction);

    if (apiFunction.isBeta) {
      this._writeBetaWarning(markupPage.elements);
    }

    markupPage.elements.push(...apiFunction.summary);

    markupPage.elements.push(Markup.PARAGRAPH);
    markupPage.elements.push(...Markup.createTextElements('Signature:', { bold: true }));
    markupPage.elements.push(Markup.createCodeBox(docFunction.name, 'javascript'));

    if (apiFunction.returnValue) {
      markupPage.elements.push(...Markup.createTextElements('Returns:', { bold: true }));
      markupPage.elements.push(...Markup.createTextElements(' '));
      markupPage.elements.push(Markup.createCode(apiFunction.returnValue.type, 'javascript'));
      markupPage.elements.push(Markup.PARAGRAPH);
      markupPage.elements.push(...apiFunction.returnValue.description);
    }

    if (apiFunction.remarks && apiFunction.remarks.length) {
      markupPage.elements.push(Markup.createHeading1('Remarks'));
      markupPage.elements.push(...apiFunction.remarks);
    }

    if (Object.keys(apiFunction.parameters).length > 0) {
      const parametersTable: IMarkupTable = Markup.createTable([
        Markup.createTextElements('Parameter'),
        Markup.createTextElements('Type'),
        Markup.createTextElements('Description')
      ]);

      markupPage.elements.push(Markup.createHeading1('Parameters'));
      markupPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(apiFunction.parameters)) {
        const apiParameter: IApiParameter = apiFunction.parameters[parameterName];
          parametersTable.rows.push(Markup.createTableRow([
            [Markup.createCode(parameterName, 'javascript')],
            apiParameter.type ? [Markup.createCode(apiParameter.type, 'javascript')] : [],
            apiParameter.description
          ])
        );
      }
    }

    this._writePage(markupPage, docFunction);
  }

  private _writeBreadcrumb(markupPage: IMarkupPage, docItem: DocItem): void {
    markupPage.breadcrumb.push(Markup.createWebLinkFromText('Home', './index'));

    for (const hierarchyItem of docItem.getHierarchy()) {
      markupPage.breadcrumb.push(...Markup.createTextElements(' > '));
      markupPage.breadcrumb.push(Markup.createApiLinkFromText(
        hierarchyItem.name, hierarchyItem.getApiReference()));
    }
  }

  private _writeBetaWarning(elements: MarkupStructuredElement[]): void {
    const betaWarning: string = 'This API is provided as a preview for developers and may change'
      + ' based on feedback that we receive.  Do not use this API in a production environment.';
    elements.push(
      Markup.createNoteBoxFromText(betaWarning)
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

        // NOTE: GitHub's markdown renderer does not resolve relative hyperlinks correctly
        // unless they start with "./" or "../".
        const docFilename: string = './' + this._getFilenameForDocItem(resolveResult.docItem);
        args.prefix = '[';
        args.suffix = '](' + docFilename + ')';
      }
    });

    fsx.writeFileSync(filename, Text.convertToCrLf(content));
  }

  private _getFilenameForDocItem(docItem: DocItem): string {
    let baseName: string = '';
    for (const part of docItem.getHierarchy()) {
      if (part.kind === DocItemKind.Package) {
        baseName = PackageName.getUnscopedName(part.name);
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
