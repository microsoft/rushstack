// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os  from 'os';
import * as path from 'path';
import * as ts from 'typescript';

import Extractor from '../Extractor';
import ApiStructuredType from '../definitions/ApiStructuredType';
import ApiEnum from '../definitions/ApiEnum';
import ApiEnumValue from '../definitions/ApiEnumValue';
import ApiFunction from '../definitions/ApiFunction';
import ApiItem, { ApiItemKind } from '../definitions/ApiItem';
import ApiItemVisitor from '../ApiItemVisitor';
import ApiPackage from '../definitions/ApiPackage';
import ApiParameter from '../definitions/ApiParameter';
import ApiProperty from '../definitions/ApiProperty';
import ApiMember, { AccessModifier } from '../definitions/ApiMember';
import ApiNamespace from '../definitions/ApiNamespace';
import ApiModuleVariable from '../definitions/ApiModuleVariable';
import ApiMethod from '../definitions/ApiMethod';
import { ReleaseTag } from '../definitions/ApiDocumentation';
import { IReturn, IParam }from '../IDocElement';
import JsonFile from '../JsonFile';
import ApiJsonFile from './ApiJsonFile';

/**
 * For a library such as "example-package", ApiFileGenerator generates the "example-package.api.ts"
 * report which is used to detect API changes.  The output is pseudocode whose syntax is similar
 * but not identical to a "*.d.ts" typings file.  The output file is designed to be committed to
 * Git with a branch policy that will trigger an API review workflow whenever the file contents
 * have changed.  For example, the API file indicates *whether* a class has been documented,
 * but it does not include the documentation text (since minor text changes should not require
 * an API review).
 *
 * @public
 */
export default class ApiJsonGenerator extends ApiItemVisitor {
  private static _methodCounter: number = 0;
  private static _MEMBERS_KEY: string = 'members';
  private static _EXPORTS_KEY: string = 'exports';

  protected jsonOutput: Object = {};

  // @override
  protected visit(apiItem: ApiItem, refObject?: Object): void {
    switch (apiItem.documentation.releaseTag) {
      case ReleaseTag.None:
      case ReleaseTag.Beta:
      case ReleaseTag.Public:
        break;
      default:
        return; // skip @alpha and @internal definitions
    }

    super.visit(apiItem, refObject);
  }

  public writeJsonFile(reportFilename: string, extractor: Extractor): void {
    this.visit(extractor.package, this.jsonOutput);

    // Write the output before validating the schema, so we can debug it
    JsonFile.saveJsonFile(reportFilename, this.jsonOutput);

    // Validate that the output conforms to our JSON schema
    const apiJsonSchema: { } = JsonFile.loadJsonFile(path.join(__dirname, '../schemas/api-json-schema.json'));

    JsonFile.validateSchema(this.jsonOutput, apiJsonSchema,
      (errorDetail: string): void => {
        const errorMessage: string
          = `ApiJsonGenerator validation error - output does not conform to api-json-schema.json:` + os.EOL
          + reportFilename + os.EOL
          + errorDetail;

        console.log(os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL);
        throw new Error(errorMessage);
      }
    );
  }

  protected visitApiStructuredType(apiStructuredType: ApiStructuredType, refObject?: Object): void {
    if (!apiStructuredType.supportedName) {
      return;
    }

    const kind: string =
      apiStructuredType.kind === ApiItemKind.Class ? ApiJsonFile.convertKindToJson(ApiItemKind.Class) :
      apiStructuredType.kind === ApiItemKind.Interface ?
        ApiJsonFile.convertKindToJson(ApiItemKind.Interface) : '';

    const structureNode: Object = {
      kind: kind,
      extends: apiStructuredType.extends || '',
      implements: apiStructuredType.implements || '',
      typeParameters: apiStructuredType.typeParameters || [],
      deprecatedMessage: apiStructuredType.documentation.deprecatedMessage || [],
      summary: apiStructuredType.documentation.summary || [],
      remarks: apiStructuredType.documentation.remarks || [],
      isBeta: apiStructuredType.documentation.releaseTag === ReleaseTag.Beta
    };
    refObject[apiStructuredType.name] = structureNode;

    ApiJsonGenerator._methodCounter = 0;

    const members: ApiItem[] = apiStructuredType.getSortedMemberItems();

    if (members && members.length) {
      const membersNode: Object = {};
      structureNode[ApiJsonGenerator._MEMBERS_KEY] = membersNode;

      for (const apiItem of members) {
        this.visit(apiItem, membersNode);
      }
    }
  }

  protected visitApiEnum(apiEnum: ApiEnum, refObject?: Object): void {
    if (!apiEnum.supportedName) {
      return;
    }

    const valuesNode: Object = {};
    const enumNode: Object = {
      kind: ApiJsonFile.convertKindToJson(apiEnum.kind),
      values: valuesNode,
      deprecatedMessage: apiEnum.documentation.deprecatedMessage || [],
      summary: apiEnum.documentation.summary || [],
      remarks: apiEnum.documentation.remarks || [],
      isBeta: apiEnum.documentation.releaseTag === ReleaseTag.Beta
    };
    refObject[apiEnum.name] = enumNode;

    for (const apiItem of apiEnum.getSortedMemberItems()) {
      this.visit(apiItem, valuesNode);
    }
  }

  protected visitApiEnumValue(apiEnumValue: ApiEnumValue, refObject?: Object): void {
    if (!apiEnumValue.supportedName) {
      return;
    }

    const declaration: ts.Declaration = apiEnumValue.getDeclaration();
    const firstToken: ts.Node = declaration ? declaration.getFirstToken() : undefined;
    const lastToken: ts.Node = declaration ? declaration.getLastToken() : undefined;

    const value: string = lastToken && lastToken !== firstToken ? lastToken.getText() : '';

    refObject[apiEnumValue.name] = {
      kind: ApiJsonFile.convertKindToJson(apiEnumValue.kind),
      value: value,
      deprecatedMessage: apiEnumValue.documentation.deprecatedMessage || [],
      summary: apiEnumValue.documentation.summary || [],
      remarks: apiEnumValue.documentation.remarks || [],
      isBeta: apiEnumValue.documentation.releaseTag === ReleaseTag.Beta
    };
  }

  protected visitApiFunction(apiFunction: ApiFunction, refObject?: Object): void {
    if (!apiFunction.supportedName) {
      return;
    }

    for (const param of apiFunction.params) {
      this.visitApiParam(param, apiFunction.documentation.parameters[param.name]);
    }
    const returnValueNode: IReturn = {
      type: apiFunction.returnType,
      description: apiFunction.documentation.returnsMessage
    };

    const newNode: Object = {
      kind: ApiJsonFile.convertKindToJson(apiFunction.kind),
      returnValue: returnValueNode,
      parameters: apiFunction.documentation.parameters,
      deprecatedMessage: apiFunction.documentation.deprecatedMessage || [],
      summary: apiFunction.documentation.summary || [],
      remarks: apiFunction.documentation.remarks || [],
      isBeta: apiFunction.documentation.releaseTag === ReleaseTag.Beta
    };

    refObject[apiFunction.name] = newNode;
  }

  protected visitApiPackage(apiPackage: ApiPackage, refObject?: Object): void {
    /* tslint:disable:no-string-literal */
    refObject['kind'] = ApiJsonFile.convertKindToJson(apiPackage.kind);
    refObject['summary'] = apiPackage.documentation.summary;
    refObject['remarks'] = apiPackage.documentation.remarks;
    /* tslint:enable:no-string-literal */

    const membersNode: Object = {};
    refObject[ApiJsonGenerator._EXPORTS_KEY] = membersNode;

    for (const apiItem of apiPackage.getSortedMemberItems()) {
      this.visit(apiItem, membersNode);
    }
  }

  protected visitApiNamespace(apiNamespace: ApiNamespace, refObject?: Object): void {
    if (!apiNamespace.supportedName) {
      return;
    }

    const membersNode: Object = {};
    for (const apiItem of apiNamespace.getSortedMemberItems()) {
      this.visit(apiItem, membersNode);
    }

    const newNode: Object = {
      kind: ApiJsonFile.convertKindToJson(apiNamespace.kind),
      deprecatedMessage: apiNamespace.documentation.deprecatedMessage || [],
      summary: apiNamespace.documentation.summary || [],
      remarks: apiNamespace.documentation.remarks || [],
      isBeta: apiNamespace.documentation.releaseTag === ReleaseTag.Beta,
      exports: membersNode
    };

    refObject[apiNamespace.name] = newNode;
  }

  protected visitApiMember(apiMember: ApiMember, refObject?: Object): void {
    if (!apiMember.supportedName) {
      return;
    }

    refObject[apiMember.name] = 'apiMember-' + apiMember.getDeclaration().kind;
  }

  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void {
    if (!apiProperty.supportedName) {
      return;
    }

    if (apiProperty.getDeclaration().kind === ts.SyntaxKind.SetAccessor) {
      return;
    }

    const newNode: Object = {
      kind: ApiJsonFile.convertKindToJson(apiProperty.kind),
      isOptional: !!apiProperty.isOptional,
      isReadOnly: !!apiProperty.isReadOnly,
      isStatic: !!apiProperty.isStatic,
      type: apiProperty.type,
      deprecatedMessage: apiProperty.documentation.deprecatedMessage || [],
      summary: apiProperty.documentation.summary || [],
      remarks: apiProperty.documentation.remarks || [],
      isBeta: apiProperty.documentation.releaseTag === ReleaseTag.Beta
    };

    refObject[apiProperty.name] = newNode;
  }

  protected visitApiModuleVariable(apiModuleVariable: ApiModuleVariable, refObject?: Object): void {
    const newNode: Object = {
      kind: ApiJsonFile.convertKindToJson(apiModuleVariable.kind),
      type: apiModuleVariable.type,
      value: apiModuleVariable.value,
      deprecatedMessage: apiModuleVariable.documentation.deprecatedMessage || [],
      summary: apiModuleVariable.documentation.summary || [],
      remarks: apiModuleVariable.documentation.remarks || [],
      isBeta: apiModuleVariable.documentation.releaseTag === ReleaseTag.Beta
    };

    refObject[apiModuleVariable.name] = newNode;
  }

  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void {
    if (!apiMethod.supportedName) {
      return;
    }

    for (const param of apiMethod.params) {
      this.visitApiParam(param, apiMethod.documentation.parameters[param.name]);
    }

    let newNode: Object;
    if (apiMethod.name === '__constructor') {
      newNode = {
        kind: ApiJsonFile.convertKindToJson(ApiItemKind.Constructor),
        signature: apiMethod.getDeclarationLine(),
        parameters: apiMethod.documentation.parameters,
        deprecatedMessage: apiMethod.documentation.deprecatedMessage || [],
        summary: apiMethod.documentation.summary || [],
        remarks: apiMethod.documentation.remarks || []
      };
    } else {
      const returnValueNode: IReturn = {
        type: apiMethod.returnType,
        description: apiMethod.documentation.returnsMessage
      };

      newNode = {
        kind: ApiJsonFile.convertKindToJson(apiMethod.kind),
        signature: apiMethod.getDeclarationLine(),
        accessModifier: apiMethod.accessModifier ? AccessModifier[apiMethod.accessModifier].toLowerCase() : '',
        isOptional: !!apiMethod.isOptional,
        isStatic: !!apiMethod.isStatic,
        returnValue: returnValueNode,
        parameters: apiMethod.documentation.parameters,
        deprecatedMessage: apiMethod.documentation.deprecatedMessage || [],
        summary: apiMethod.documentation.summary || [],
        remarks: apiMethod.documentation.remarks || [],
        isBeta: apiMethod.documentation.releaseTag === ReleaseTag.Beta
      };
    }

    refObject[apiMethod.name] = newNode;
  }

  protected visitApiParam(apiParam: ApiParameter, refObject?: Object): void {
    if (!apiParam.supportedName) {
      return;
    }

    if (refObject) {
      (refObject as IParam).isOptional = apiParam.isOptional;
      (refObject as IParam).isSpread = apiParam.isSpread;
      (refObject as IParam).type = apiParam.type;
    }
  }
}
