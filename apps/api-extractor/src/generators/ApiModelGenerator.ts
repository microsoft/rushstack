// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable:no-bitwise

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { Collector } from '../collector/Collector';
import { ApiModel } from '../api/model/ApiModel';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ApiClass } from '../api/model/ApiClass';
import { ApiPackage } from '../api/model/ApiPackage';
import { ApiEntryPoint } from '../api/model/ApiEntryPoint';
import { ApiMethod } from '../api/model/ApiMethod';
import { ApiNamespace } from '../api/model/ApiNamespace';
import { ApiInterface } from '../api/model/ApiInterface';
import { ApiPropertySignature } from '../api/model/ApiPropertySignature';
import { Span } from '../analyzer/Span';
import { ApiParameter } from '../api/model/ApiParameter';
import { ApiItemContainerMixin } from '../api/mixins/ApiItemContainerMixin';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { ApiProperty } from '../api/model/ApiProperty';
import { ApiMethodSignature } from '../api/model/ApiMethodSignature';
import { ApiFunctionLikeMixin } from '../api/mixins/ApiFunctionLikeMixin';
import { ApiEnum } from '../api/model/ApiEnum';
import { ApiEnumMember } from '../api/model/ApiEnumMember';

export class ApiModelGenerator {
  private readonly _collector: Collector;
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;
  private readonly _apiModel: ApiModel;

  public constructor(collector: Collector) {
    this._collector = collector;
    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
    this._apiModel = new ApiModel();
  }

  public get apiModel(): ApiModel {
    return this._apiModel;
  }

  public buildApiPackage(): ApiPackage {
    const packageDocComment: tsdoc.DocComment | undefined = this._collector.package.tsdocComment;

    const apiPackage: ApiPackage = new ApiPackage({
      name: this._collector.package.name,
      docComment: packageDocComment
    });
    this._apiModel.addMember(apiPackage);

    const apiEntryPoint: ApiEntryPoint = new ApiEntryPoint({ name: '' });
    apiPackage.addMember(apiEntryPoint);

    // Create a CollectorEntity for each top-level export
    for (const entity of this._collector.entities) {
      for (const astDeclaration of entity.astSymbol.astDeclarations) {
        if (entity.exported) {
          this._processDeclaration(astDeclaration, entity.nameForEmit, apiEntryPoint);
        }
      }
    }

    return apiPackage;
  }

  private _processDeclaration(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    if ((astDeclaration.modifierFlags & ts.ModifierFlags.Private) !== 0) {
      return; // trim out private declarations
    }

    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.EnumDeclaration:
        this._processApiEnum(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.EnumMember:
        this._processApiEnumMember(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        this._processApiInterface(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.MethodDeclaration:
        this._processApiMethod(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.MethodSignature:
        this._processApiMethodSignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.ModuleDeclaration:
        this._processApiNamespace(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.PropertyDeclaration:
        this._processApiProperty(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.PropertySignature:
        this._processApiPropertySignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
        default:
    }
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, undefined, parentApiItem);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiClass.getCanonicalReference(name);

    let apiClass: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiClass;

    if (apiClass === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation);  // FirstPunctuation = "{"

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiClass = new ApiClass({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiClass);
  }

  private _processApiEnum(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiEnum.getCanonicalReference(name);

    let apiEnum: ApiEnum | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiEnum;

    if (apiEnum === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation);  // FirstPunctuation = "{"

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiEnum = new ApiEnum({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiEnum);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiEnum);
  }

  private _processApiEnumMember(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiEnumMember.getCanonicalReference(name);

    let apiEnumMember: ApiEnumMember | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiMethod;

    if (apiEnumMember === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiEnumMember = new ApiEnumMember({ name, signature, docComment, releaseTag });

      parentApiItem.addMember(apiEnumMember);
    }
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiInterface.getCanonicalReference(name);

    let apiInterface: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiInterface;

    if (apiInterface === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation); // FirstPunctuation = "{"
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiInterface = new ApiInterface({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;
    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethod.getCanonicalReference(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiMethod;

    if (apiMethod === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;
      const resultTypeSignature: string = this._getSignatureForTypeNode(methodDeclaration.type);

      apiMethod = new ApiMethod({ name, signature, docComment, releaseTag, resultTypeSignature, isStatic,
        overloadIndex });

      for (const parameter of methodDeclaration.parameters) {
        this._processApiParameter(parameter, apiMethod);
      }

      parentApiItem.addMember(apiMethod);
    }
  }

  private _processApiMethodSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const methodSignature: ts.MethodSignature = astDeclaration.declaration as ts.MethodSignature;

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethodSignature.getCanonicalReference(name, overloadIndex);

    let apiMethodSignature: ApiMethodSignature | undefined = parentApiItem.tryGetMember(canonicalReference) as
      ApiMethodSignature;

    if (apiMethodSignature === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;
      const resultTypeSignature: string = this._getSignatureForTypeNode(methodSignature.type);

      apiMethodSignature = new ApiMethodSignature({ name, signature, docComment, releaseTag, resultTypeSignature,
        overloadIndex });

      for (const parameter of methodSignature.parameters) {
        this._processApiParameter(parameter, apiMethodSignature);

      }

      parentApiItem.addMember(apiMethodSignature);
    }
  }

  private _processApiParameter(parameterDeclaration: ts.ParameterDeclaration,
    functionLikeItem: ApiFunctionLikeMixin): void {

    const signature: string = parameterDeclaration.getText().trim();
    const resultTypeSignature: string = this._getSignatureForTypeNode(parameterDeclaration.type);

    functionLikeItem.addParameter(new ApiParameter({
      name: parameterDeclaration.name.getText() || '',
      signature,
      resultTypeSignature
    }));
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiNamespace.getCanonicalReference(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiNamespace === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.ModuleBlock); // ModuleBlock = the "{ ... }" block
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiNamespace = new ApiNamespace({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiNamespace);
  }

  private _processApiProperty(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const propertyDeclaration: ts.PropertyDeclaration = astDeclaration.declaration as ts.PropertyDeclaration;

    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;

    const canonicalReference: string = ApiProperty.getCanonicalReference(name, isStatic);

    let apiProperty: ApiProperty | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiProperty;

    if (apiProperty === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;
      const resultTypeSignature: string = this._getSignatureForTypeNode(propertyDeclaration.type);

      apiProperty = new ApiProperty({ name, signature, docComment, releaseTag, resultTypeSignature, isStatic });
      parentApiItem.addMember(apiProperty);
    } else {
      // If the property was already declared before (via a merged interface declaration),
      // we assume its signature is identical, because the language requires that.
    }
  }

  private _processApiPropertySignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiPropertySignature.getCanonicalReference(name);

    const propertySignature: ts.PropertySignature = astDeclaration.declaration as ts.PropertySignature;

    let apiPropertySignature: ApiPropertySignature | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiPropertySignature;

    if (apiPropertySignature === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;
      const resultTypeSignature: string = this._getSignatureForTypeNode(propertySignature.type);

      apiPropertySignature = new ApiPropertySignature({ name, signature, docComment, releaseTag, resultTypeSignature });
      parentApiItem.addMember(apiPropertySignature);
    } else {
      // If the property was already declared before (via a merged interface declaration),
      // we assume its signature is identical, because the language requires that.
    }
  }

  private _getOverloadIndex(astDeclaration: AstDeclaration): number {
    const allDeclarations: ReadonlyArray<AstDeclaration> = astDeclaration.astSymbol.astDeclarations;
    if (allDeclarations.length === 1) {
      return 0; // trivial case
    }

    let overloadIndex: number | undefined = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);

    if (overloadIndex === undefined) {
      let nextIndex: number = 0;
      for (const other of allDeclarations) {
        // Filter out other declarations that are not overloads.  For example, an overloaded function can also
        // be a namespace.
        if (other.declaration.kind === astDeclaration.declaration.kind) {
          this._cachedOverloadIndexesByDeclaration.set(other, nextIndex);
          ++nextIndex;
        }
      }
      overloadIndex = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);
    }

    if (overloadIndex === undefined) {
      // This should never happen
      throw new Error('Error calculating overload index for declaration');
    }

    return overloadIndex;
  }

  // Used for classes and interfaces, this returns the declaration text stopping before a token such as "{"
  private _getSignatureBeforeNodeKind(declaration: ts.Declaration, nodeKind: ts.SyntaxKind): string {
    const span: Span = new Span(declaration);

    let done: boolean = false;
    for (const childSpan of span.children) {
      if (childSpan.kind === nodeKind) {
        // We reached the token (e.g. "{")
        done = true;
      }
      if (done) {
        childSpan.modification.skipAll();
      }

      // Also discard any comments
      if (childSpan.kind === ts.SyntaxKind.JSDocComment) {
        childSpan.modification.skipAll();
      }
    }
    return span.getModifiedText().trim();
  }

  private _getSignatureForTypeNode(type: ts.TypeNode | undefined): string {
    if (type) {
      return type.getText();
    }
    return '';
  }
}
