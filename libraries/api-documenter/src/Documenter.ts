// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';

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

import { ApiJsonFile } from './ApiJsonFile';
import { BasePageRenderer } from './BasePageRenderer';
import { RenderingHelpers } from './RenderingHelpers';
import { Domifier } from './Domifier';
import { DocumentationNode } from './DocumentationNode';

/**
 * This is the main engine that reads *.api.json input files and generates IMarkupPage data structures,
 * which are then rendered using an BasePageRenderer subclass.
 */
export class Documenter {
  private readonly _apiJsonFiles: ApiJsonFile[] = [];

  public loadApiJsonFile(apiJsonFilePath: string): void {
    this._apiJsonFiles.push(ApiJsonFile.loadFromFile(apiJsonFilePath));
  }

  public writeDocs(renderer: BasePageRenderer): void {
    console.log(os.EOL + `Deleting old *${renderer.outputFileExtension} files...` + os.EOL);
    renderer.deleteOutputFiles();

    for (const apiJsonFile of this._apiJsonFiles) {
      this._writePackagePage(apiJsonFile, renderer);
    }
  }

  /**
   * GENERATE PAGE: PACKAGE
   */
  private _writePackagePage(apiJsonFile: ApiJsonFile, renderer: BasePageRenderer): void {
    console.log(`Writing ${apiJsonFile.packageName} package`);

    const unscopedPackageName: string = RenderingHelpers.getUnscopedPackageName(apiJsonFile.packageName);

    const docPackage: IApiPackage = apiJsonFile.docPackage;

    const packageNode: DocumentationNode = new DocumentationNode(docPackage, unscopedPackageName, undefined);

    const domPage: IMarkupPage = Domifier.createPage(`${unscopedPackageName} package`, packageNode.docId);
    this._writeBreadcrumb(domPage, packageNode);

    domPage.elements.push(...Domifier.renderDocElements(apiJsonFile.docPackage.summary));

    const classesTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Class'),
      Domifier.createTextElements('Description')
    ]);

    const interfacesTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Interface'),
      Domifier.createTextElements('Description')
    ]);

    const functionsTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Function'),
      Domifier.createTextElements('Returns'),
      Domifier.createTextElements('Description')
    ]);

    const enumerationsTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Enumeration'),
      Domifier.createTextElements('Description')
    ]);

    for (const exportName of Object.keys(docPackage.exports)) {
      const docItem: ApiItem = docPackage.exports[exportName];

      const exportNode: DocumentationNode = new DocumentationNode(docItem, exportName, packageNode);

      const docItemTitle: MarkupBasicElement[] = [
        Domifier.createDocumentationLink(
          [ Domifier.createCode(exportName, 'javascript') ],
          exportNode.docId)
      ];

      const docItemDescription: MarkupBasicElement[] = [];

      if (docItem.isBeta) {
        docItemDescription.push(...Domifier.createTextElements('(BETA)', { italics: true, bold: true }));
        docItemDescription.push(...Domifier.createTextElements(' '));
      }
      docItemDescription.push(...Domifier.renderDocElements(docItem.summary));

      switch (docItem.kind) {
        case 'class':
          classesTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          this._writeClassPage(docItem, exportNode, renderer);
          break;
        case 'interface':
          interfacesTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          this._writeInterfacePage(docItem, exportNode, renderer);
          break;
        case 'function':
          functionsTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              docItem.returnValue ? [Domifier.createCode(docItem.returnValue.type, 'javascript')] : [],
              docItemDescription
            ])
          );
          this._writeFunctionPage(docItem, exportNode, renderer);
          break;
        case 'enum':
          enumerationsTable.rows.push(
            Domifier.createTableRow([
              docItemTitle,
              docItemDescription
            ])
          );
          this._writeEnumPage(docItem, exportNode, renderer);
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

    if (functionsTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Functions'));
      domPage.elements.push(functionsTable);
    }

    if (enumerationsTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Enumerations'));
      domPage.elements.push(enumerationsTable);
    }

    renderer.writePage(domPage);
  }

  /**
   * GENERATE PAGE: CLASS
   */
  private _writeClassPage(docClass: IApiClass, classNode: DocumentationNode, renderer: BasePageRenderer): void {
    const className: string = classNode.name;

    // TODO: Show concise generic parameters with class name
    const domPage: IMarkupPage = Domifier.createPage(`${className} class`, classNode.docId);
    this._writeBreadcrumb(domPage, classNode);

    if (docClass.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docClass.summary));

    domPage.elements.push(Domifier.createHeading1('Constructor'));

    // TODO: pending WBT fix
    domPage.elements.push(...Domifier.createTextElements('Constructs a new instance of the '));
    domPage.elements.push(Domifier.createCode(className));
    domPage.elements.push(...Domifier.createTextElements(' class'));

    const propertiesTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Property'),
      Domifier.createTextElements('Access Modifier'),
      Domifier.createTextElements('Type'),
      Domifier.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Method'),
      Domifier.createTextElements('Access Modifier'),
      Domifier.createTextElements('Returns'),
      Domifier.createTextElements('Description')
    ]);

    for (const memberName of Object.keys(docClass.members)) {
      const member: ApiMember = docClass.members[memberName];
      const memberNode: DocumentationNode = new DocumentationNode(member, memberName, classNode);

      switch (member.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            Domifier.createDocumentationLink(
              [Domifier.createCode(memberName, 'javascript')],
              memberNode.docId)
          ];

          propertiesTable.rows.push(
            Domifier.createTableRow([
              propertyTitle,
              [],
              [Domifier.createCode(member.type, 'javascript')],
              Domifier.renderDocElements(member.summary)
            ])
          );
          this._writePropertyPage(member, memberNode, renderer);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            Domifier.createDocumentationLink(
              [Domifier.createCode(RenderingHelpers.getConciseSignature(memberName, member), 'javascript')],
              memberNode.docId)
          ];

          methodsTable.rows.push(
            Domifier.createTableRow([
              methodTitle,
              member.accessModifier ? [Domifier.createCode(member.accessModifier.toString(), 'javascript')] : [],
              member.returnValue ? [Domifier.createCode(member.returnValue.type, 'javascript')] : [],
              Domifier.renderDocElements(member.summary)
            ])
          );
          this._writeMethodPage(member, memberNode, renderer);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Properties'));
      domPage.elements.push(propertiesTable);
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

  /**
   * GENERATE PAGE: INTERFACE
   */
  private _writeInterfacePage(docInterface: IApiInterface, interfaceNode: DocumentationNode,
    renderer: BasePageRenderer): void {

    const interfaceName: string = interfaceNode.name;

    // TODO: Show concise generic parameters with class name
    const domPage: IMarkupPage = Domifier.createPage(`${interfaceName} interface`, interfaceNode.docId);
    this._writeBreadcrumb(domPage, interfaceNode);

    if (docInterface.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docInterface.summary));

    const propertiesTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Property'),
      Domifier.createTextElements('Type'),
      Domifier.createTextElements('Description')
    ]);

    const methodsTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Method'),
      Domifier.createTextElements('Returns'),
      Domifier.createTextElements('Description')
    ]);

    for (const memberName of Object.keys(docInterface.members)) {
      const member: ApiMember = docInterface.members[memberName];
      const memberNode: DocumentationNode = new DocumentationNode(member, memberName, interfaceNode);

      switch (member.kind) {
        case 'property':
          const propertyTitle: MarkupBasicElement[] = [
            Domifier.createDocumentationLink(
              [Domifier.createCode(memberName, 'javascript')],
              memberNode.docId)
          ];

          propertiesTable.rows.push(
            Domifier.createTableRow([
              propertyTitle,
              [Domifier.createCode(member.type)],
              Domifier.renderDocElements(member.summary)
            ])
          );
          this._writePropertyPage(member, memberNode, renderer);
          break;

        case 'method':
          const methodTitle: MarkupBasicElement[] = [
            Domifier.createDocumentationLink(
              [Domifier.createCode(RenderingHelpers.getConciseSignature(memberName, member), 'javascript')],
              memberNode.docId)
          ];

          methodsTable.rows.push(
            Domifier.createTableRow([
              methodTitle,
              member.returnValue ? [Domifier.createCode(member.returnValue.type, 'javascript')] : [],
              Domifier.renderDocElements(member.summary)
            ])
          );
          this._writeMethodPage(member, memberNode, renderer);
          break;
      }
    }

    if (propertiesTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Properties'));
      domPage.elements.push(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      domPage.elements.push(Domifier.createHeading1('Methods'));
      domPage.elements.push(methodsTable);
    }

    if (docInterface.remarks && docInterface.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docInterface.remarks));
    }

    renderer.writePage(domPage);
  }

  /**
   * GENERATE PAGE: ENUM
   */
  private _writeEnumPage(docEnum: IApiEnum, enumNode: DocumentationNode,
    renderer: BasePageRenderer): void {

    const enumName: string = enumNode.name;

    // TODO: Show concise generic parameters with class name
    const domPage: IMarkupPage = Domifier.createPage(`${enumName} enumeration`, enumNode.docId);
    this._writeBreadcrumb(domPage, enumNode);

    if (docEnum.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docEnum.summary));

    const membersTable: IMarkupTable = Domifier.createTable([
      Domifier.createTextElements('Member'),
      Domifier.createTextElements('Value'),
      Domifier.createTextElements('Description')
    ]);

    for (const memberName of Object.keys(docEnum.values)) {
      const member: IApiEnumMember = (docEnum.values as any)[memberName]; // tslint:disable-line:no-any

      const enumValue: MarkupBasicElement[] = [];

      if (member.value) {
        enumValue.push(Domifier.createCode('= ' + member.value));
      }

      membersTable.rows.push(
        Domifier.createTableRow([
          Domifier.createTextElements(memberName),
          enumValue,
          Domifier.renderDocElements(member.summary)
        ])
      );
    }

    if (membersTable.rows.length > 0) {
      domPage.elements.push(membersTable);
    }

    renderer.writePage(domPage);
  }

  /**
   * GENERATE PAGE: PROPERTY
   */
  private _writePropertyPage(docProperty: IApiProperty, propertyNode: DocumentationNode,
    renderer: BasePageRenderer): void {

    const fullProperyName: string = propertyNode.parent!.name + '.' + propertyNode.name;

    const domPage: IMarkupPage = Domifier.createPage(`${fullProperyName} property`, propertyNode.docId);
    this._writeBreadcrumb(domPage, propertyNode);

    if (docProperty.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docProperty.summary));

    domPage.elements.push(Domifier.PARAGRAPH);
    domPage.elements.push(...Domifier.createTextElements('Signature:', { bold: true }));
    domPage.elements.push(Domifier.createCodeBox(propertyNode.name + ': ' + docProperty.type, 'javascript'));

    if (docProperty.remarks && docProperty.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docProperty.remarks));
    }

    renderer.writePage(domPage);
  }

  /**
   * GENERATE PAGE: METHOD
   */
  private _writeMethodPage(docMethod: IApiMethod, methodNode: DocumentationNode, renderer: BasePageRenderer): void {

    const fullMethodName: string = methodNode.parent!.name + '.' + methodNode.name;

    const domPage: IMarkupPage = Domifier.createPage(`${fullMethodName} method`, methodNode.docId);
    this._writeBreadcrumb(domPage, methodNode);

    if (docMethod.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docMethod.summary));

    domPage.elements.push(Domifier.PARAGRAPH);
    domPage.elements.push(...Domifier.createTextElements('Signature:', { bold: true }));
    domPage.elements.push(Domifier.createCodeBox(docMethod.signature, 'javascript'));

    if (docMethod.returnValue) {
      domPage.elements.push(...Domifier.createTextElements('Returns:', { bold: true }));
      domPage.elements.push(...Domifier.createTextElements(' '));
      domPage.elements.push(Domifier.createCode(docMethod.returnValue.type, 'javascript'));
      domPage.elements.push(Domifier.PARAGRAPH);
      domPage.elements.push(...Domifier.renderDocElements(docMethod.returnValue.description));
    }

    if (docMethod.remarks && docMethod.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docMethod.remarks));
    }

    if (Object.keys(docMethod.parameters).length > 0) {
      const parametersTable: IMarkupTable = Domifier.createTable([
        Domifier.createTextElements('Parameter'),
        Domifier.createTextElements('Type'),
        Domifier.createTextElements('Description')
      ]);

      domPage.elements.push(Domifier.createHeading1('Parameters'));
      domPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(docMethod.parameters)) {
        const parameter: IApiParameter = docMethod.parameters[parameterName];
          parametersTable.rows.push(Domifier.createTableRow([
            [Domifier.createCode(parameterName, 'javascript')],
            parameter.type ? [Domifier.createCode(parameter.type, 'javascript')] : [],
            Domifier.renderDocElements(parameter.description)
          ])
        );
      }
    }

    renderer.writePage(domPage);
  }

  /**
   * GENERATE PAGE: FUNCTION
   */
  private _writeFunctionPage(docFunction: IApiFunction, functionNode: DocumentationNode,
    renderer: BasePageRenderer): void {

    const domPage: IMarkupPage = Domifier.createPage(`${functionNode.name} function`, functionNode.docId);
    this._writeBreadcrumb(domPage, functionNode);

    if (docFunction.isBeta) {
      this._writeBetaWarning(domPage.elements);
    }

    domPage.elements.push(...Domifier.renderDocElements(docFunction.summary));

    domPage.elements.push(Domifier.PARAGRAPH);
    domPage.elements.push(...Domifier.createTextElements('Signature:', { bold: true }));
    domPage.elements.push(Domifier.createCodeBox(functionNode.name, 'javascript'));

    if (docFunction.returnValue) {
      domPage.elements.push(...Domifier.createTextElements('Returns:', { bold: true }));
      domPage.elements.push(...Domifier.createTextElements(' '));
      domPage.elements.push(Domifier.createCode(docFunction.returnValue.type, 'javascript'));
      domPage.elements.push(Domifier.PARAGRAPH);
      domPage.elements.push(...Domifier.renderDocElements(docFunction.returnValue.description));
    }

    if (docFunction.remarks && docFunction.remarks.length) {
      domPage.elements.push(Domifier.createHeading1('Remarks'));
      domPage.elements.push(...Domifier.renderDocElements(docFunction.remarks));
    }

    if (Object.keys(docFunction.parameters).length > 0) {
      const parametersTable: IMarkupTable = Domifier.createTable([
        Domifier.createTextElements('Parameter'),
        Domifier.createTextElements('Type'),
        Domifier.createTextElements('Description')
      ]);

      domPage.elements.push(Domifier.createHeading1('Parameters'));
      domPage.elements.push(parametersTable);
      for (const parameterName of Object.keys(docFunction.parameters)) {
        const parameter: IApiParameter = docFunction.parameters[parameterName];
          parametersTable.rows.push(Domifier.createTableRow([
            [Domifier.createCode(parameterName, 'javascript')],
            parameter.type ? [Domifier.createCode(parameter.type, 'javascript')] : [],
            Domifier.renderDocElements(parameter.description)
          ])
        );
      }
    }

    renderer.writePage(domPage);
  }

  private _writeBreadcrumb(domPage: IMarkupPage, currentNode: DocumentationNode): void {
    domPage.breadcrumb.push(Domifier.createDocumentationLinkFromText('Home', 'index'));

    const reversedNodes: DocumentationNode[] = [];
    for (let node: DocumentationNode|undefined = currentNode.parent; node; node = node.parent) {
      reversedNodes.unshift(node);
    }
    for (const node of reversedNodes) {
      domPage.breadcrumb.push(...Domifier.createTextElements(' > '));
      domPage.breadcrumb.push(Domifier.createDocumentationLinkFromText(node.name, node.docId));
    }
  }

  private _writeBetaWarning(elements: MarkupStructuredElement[]): void {
    const betaWarning: string = 'This API is provided as a preview for developers and may change'
      + ' based on feedback that we receive.  Do not use this API in a production environment.';
    elements.push(
      Domifier.createNoteBoxFromText(betaWarning)
    );
  }

}
