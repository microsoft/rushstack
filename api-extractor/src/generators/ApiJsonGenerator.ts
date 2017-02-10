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
import ApiMethod from '../definitions/ApiMethod';
import { ApiTag } from '../definitions/ApiDocumentation';
import { IReturn, IParam }from '../IDocElement';
import JsonFile from '../JsonFile';

/**
  * For a library such as "example-package", ApiFileGenerator generates the "example-package.api.ts"
  * report which is used to detect API changes.  The output is pseudocode whose syntax is similar
  * but not identical to a "*.d.ts" typings file.  The output file is designed to be committed to
  * Git with a branch policy that will trigger an API review workflow whenever the file contents
  * have changed.  For example, the API file indicates *whether* a class has been documented,
  * but it does not include the documentation text (since minor text changes should not require
  * an API review).
  */
export default class ApiJsonGenerator extends ApiItemVisitor {
  private static _methodCounter: number = 0;

  private static _KIND_CONSTRUCTOR: string = 'constructor';
  private static _KIND_CLASS: string = 'class';
  private static _KIND_ENUM: string = 'enum';
  private static _KIND_INTERFACE: string = 'interface';
  private static _KIND_FUNCTION: string = 'function';
  private static _KIND_PACKAGE: string = 'package';
  private static _KIND_PROPERTY: string = 'property';
  private static _KIND_METHOD: string = 'method';
  private static _MEMBERS_KEY: string = 'members';
  private static _EXPORTS_KEY: string = 'exports';

  // Only allow @public
  protected apiTagsToSkip: ApiTag[] = [
    ApiTag.Alpha,
    ApiTag.Beta,
    ApiTag.Internal
  ];

  protected jsonOutput: Object = {};

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
    const kind: string =
      apiStructuredType.kind === ApiItemKind.Class ? ApiJsonGenerator._KIND_CLASS :
      apiStructuredType.kind === ApiItemKind.Interface ? ApiJsonGenerator._KIND_INTERFACE :
      '';

    const structureNode: Object = {
      kind: kind,
      extends: apiStructuredType.extends || '',
      implements: apiStructuredType.implements || '',
      typeParameters: apiStructuredType.typeParameters || [],
      deprecatedMessage: apiStructuredType.documentation.deprecatedMessage || [],
      summary: apiStructuredType.documentation.summary || [],
      remarks: apiStructuredType.documentation.remarks || [],
      isBeta: apiStructuredType.documentation.apiTag === ApiTag.Beta
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
    const valuesNode: Object = {};
    const enumNode: Object = {
      kind: ApiJsonGenerator._KIND_ENUM,
      values: valuesNode,
      deprecatedMessage: apiEnum.documentation.deprecatedMessage || [],
      summary: apiEnum.documentation.summary || [],
      remarks: apiEnum.documentation.remarks || [],
      isBeta: apiEnum.documentation.apiTag === ApiTag.Beta
    };
    refObject[apiEnum.name] = enumNode;

    for (const apiItem of apiEnum.getSortedMemberItems()) {
      this.visit(apiItem, valuesNode);
    }
  }

  protected visitApiEnumValue(apiEnumValue: ApiEnumValue, refObject?: Object): void {
    const declaration: ts.Declaration = apiEnumValue.getDeclaration();
    const firstToken: ts.Node = declaration ? declaration.getFirstToken() : undefined;
    const lastToken: ts.Node = declaration ? declaration.getLastToken() : undefined;

    const value: string = lastToken && lastToken !== firstToken ? lastToken.getText() : '';

    refObject[apiEnumValue.name] = {
      value: value,
      deprecatedMessage: apiEnumValue.documentation.deprecatedMessage || [],
      summary: apiEnumValue.documentation.summary || [],
      remarks: apiEnumValue.documentation.remarks || [],
      isBeta: apiEnumValue.documentation.apiTag === ApiTag.Beta
    };
  }

  protected visitApiFunction(apiFunction: ApiFunction, refObject?: Object): void {
    for (const param of apiFunction.params) {
      this.visitApiParam(param, apiFunction.documentation.parameters[param.name]);
    }
    const returnValueNode: IReturn = {
      type: apiFunction.returnType,
      description: apiFunction.documentation.returnsMessage
    };

    const newNode: Object = {
      kind: ApiJsonGenerator._KIND_FUNCTION,
      returnValue: returnValueNode,
      parameters: apiFunction.documentation.parameters,
      deprecatedMessage: apiFunction.documentation.deprecatedMessage || [],
      summary: apiFunction.documentation.summary || [],
      remarks: apiFunction.documentation.remarks || [],
      isBeta: apiFunction.documentation.apiTag === ApiTag.Beta
    };

    refObject[apiFunction.name] = newNode;
  }

  protected visitApiPackage(apiPackage: ApiPackage, refObject?: Object): void {
    refObject['kind'] = ApiJsonGenerator._KIND_PACKAGE; /* tslint:disable-line:no-string-literal */
    refObject['summary'] = apiPackage.documentation.summary; /* tslint:disable-line:no-string-literal */
    refObject['remarks'] = apiPackage.documentation.remarks; /* tslint:disable-line:no-string-literal */

    const membersNode: Object = {};
    refObject[ApiJsonGenerator._EXPORTS_KEY] = membersNode;

    for (const apiItem of apiPackage.getSortedMemberItems()) {
      this.visit(apiItem, membersNode);
    }
  }

  protected visitApiMember(apiMember: ApiMember, refObject?: Object): void {
    refObject[apiMember.name] = 'apiMember-' + apiMember.getDeclaration().kind;
  }

  protected visitApiProperty(apiProperty: ApiProperty, refObject?: Object): void {
    if (apiProperty.getDeclaration().kind === ts.SyntaxKind.SetAccessor) {
      return;
    }

    const newNode: Object = {
      kind: ApiJsonGenerator._KIND_PROPERTY,
      isOptional: !!apiProperty.isOptional,
      isReadOnly: !!apiProperty.isReadOnly,
      isStatic: !!apiProperty.isStatic,
      type: apiProperty.type,
      deprecatedMessage: apiProperty.documentation.deprecatedMessage || [],
      summary: apiProperty.documentation.summary || [],
      remarks: apiProperty.documentation.remarks || [],
      isBeta: apiProperty.documentation.apiTag === ApiTag.Beta
    };

    refObject[apiProperty.name] = newNode;
  }

  protected visitApiMethod(apiMethod: ApiMethod, refObject?: Object): void {
    for (const param of apiMethod.params) {
      this.visitApiParam(param, apiMethod.documentation.parameters[param.name]);
    }

    let newNode: Object;
    if (apiMethod.name === '__constructor') {
      newNode = {
        kind: ApiJsonGenerator._KIND_CONSTRUCTOR,
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
        kind: ApiJsonGenerator._KIND_METHOD,
        signature: apiMethod.getDeclarationLine(),
        accessModifier: apiMethod.accessModifier ? AccessModifier[apiMethod.accessModifier].toLowerCase() : '',
        isOptional: !!apiMethod.isOptional,
        isStatic: !!apiMethod.isStatic,
        returnValue: returnValueNode,
        parameters: apiMethod.documentation.parameters,
        deprecatedMessage: apiMethod.documentation.deprecatedMessage || [],
        summary: apiMethod.documentation.summary || [],
        remarks: apiMethod.documentation.remarks || [],
        isBeta: apiMethod.documentation.apiTag === ApiTag.Beta
      };
    }

    refObject[apiMethod.name] = newNode;
  }

  protected visitApiParam(apiParam: ApiParameter, refObject?: Object): void {
    if (refObject) {
      (refObject as IParam).isOptional = apiParam.isOptional;
      (refObject as IParam).isSpread = apiParam.isSpread;
      (refObject as IParam).type = apiParam.type;
    }
  }
}
