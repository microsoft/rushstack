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
import { Parameter } from '../api/model/Parameter';
import { ApiItemContainerMixin } from '../api/mixins/ApiItemContainerMixin';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { ApiProperty } from '../api/model/ApiProperty';
import { ApiMethodSignature } from '../api/model/ApiMethodSignature';
import { ApiParameterListMixin } from '../api/mixins/ApiParameterListMixin';
import { ApiEnum } from '../api/model/ApiEnum';
import { ApiEnumMember } from '../api/model/ApiEnumMember';
import { IExcerptTokenRange, IExcerptToken } from '../api/mixins/Excerpt';
import { ExcerptBuilder, IExcerptBuilderNodeToCapture } from './ExcerptBuilder';

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

    const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;
    if (releaseTag === ReleaseTag.Internal || releaseTag === ReleaseTag.Alpha) {
      return; // trim out items marked as "@internal" or "@alpha"
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
      const classDeclaration: ts.ClassDeclaration = astDeclaration.declaration as ts.ClassDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];
      let extendsTokenRange: IExcerptTokenRange | undefined = undefined;
      const implementsTokenRanges: IExcerptTokenRange[] = [];

      for (const heritageClause of classDeclaration.heritageClauses || []) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsTokenRange = ExcerptBuilder.createEmptyTokenRange();
          if (heritageClause.types.length > 0) {
            nodesToCapture.push({ node: heritageClause.types[0], tokenRange: extendsTokenRange});
          }
        } else if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const heritageType of heritageClause.types) {
            const implementsTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
            implementsTokenRanges.push(implementsTokenRange);
            nodesToCapture.push({ node: heritageType, tokenRange: implementsTokenRange});
          }
        }
      }

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodeToStopAt: ts.SyntaxKind.FirstPunctuation,  // FirstPunctuation = "{"
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiClass = new ApiClass({ name, docComment, releaseTag,
        excerptTokens, extendsTokenRange, implementsTokenRanges });

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
      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodeToStopAt: ts.SyntaxKind.FirstPunctuation  // FirstPunctuation = "{"
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiEnum = new ApiEnum({ name, docComment, releaseTag, excerptTokens });
      parentApiItem.addMember(apiEnum);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiEnum);
  }

  private _processApiEnumMember(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiEnumMember.getCanonicalReference(name);

    let apiEnumMember: ApiEnumMember | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiEnumMember;

    if (apiEnumMember === undefined) {
      const enumMember: ts.EnumMember = astDeclaration.declaration as ts.EnumMember;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const initializerTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: enumMember.initializer, tokenRange: initializerTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiEnumMember = new ApiEnumMember({ name, docComment, releaseTag,
        excerptTokens, initializerTokenRange });

      parentApiItem.addMember(apiEnumMember);
    }
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiInterface.getCanonicalReference(name);

    let apiInterface: ApiInterface | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiInterface;

    if (apiInterface === undefined) {
      const interfaceDeclaration: ts.InterfaceDeclaration = astDeclaration.declaration as ts.InterfaceDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];
      const extendsTokenRanges: IExcerptTokenRange[] = [];

      for (const heritageClause of interfaceDeclaration.heritageClauses || []) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const heritageType of heritageClause.types) {
            const extendsTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
            extendsTokenRanges.push(extendsTokenRange);
            nodesToCapture.push({ node: heritageType, tokenRange: extendsTokenRange});
          }
        }
      }

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodeToStopAt: ts.SyntaxKind.FirstPunctuation,  // FirstPunctuation = "{"
        nodesToCapture
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiInterface = new ApiInterface({ name, docComment, releaseTag, excerptTokens, extendsTokenRanges });
      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;
    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethod.getCanonicalReference(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiMethod;

    if (apiMethod === undefined) {
      const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: methodDeclaration.type, tokenRange: returnTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiMethod = new ApiMethod({ name, docComment, releaseTag, isStatic, overloadIndex,
        excerptTokens, returnTypeTokenRange });

      for (const parameter of methodDeclaration.parameters) {
        this._processApiParameter(parameter, apiMethod);
      }

      parentApiItem.addMember(apiMethod);
    }
  }

  private _processApiMethodSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethodSignature.getCanonicalReference(name, overloadIndex);

    let apiMethodSignature: ApiMethodSignature | undefined = parentApiItem.tryGetMember(canonicalReference) as
      ApiMethodSignature;

    if (apiMethodSignature === undefined) {
      const methodSignature: ts.MethodSignature = astDeclaration.declaration as ts.MethodSignature;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: methodSignature.type, tokenRange: returnTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiMethodSignature = new ApiMethodSignature({ name, docComment, releaseTag, overloadIndex,
        excerptTokens, returnTypeTokenRange });

      for (const parameter of methodSignature.parameters) {
        this._processApiParameter(parameter, apiMethodSignature);
      }

      parentApiItem.addMember(apiMethodSignature);
    }
  }

  private _processApiParameter(parameterDeclaration: ts.ParameterDeclaration,
    apiParameterListMixin: ApiParameterListMixin): void {

    const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

    const parameterTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
    nodesToCapture.push({ node: parameterDeclaration.type, tokenRange: parameterTypeTokenRange });

    const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
      startingNode: parameterDeclaration,
      nodesToCapture
    });

    apiParameterListMixin.addParameter(new Parameter({
      name: parameterDeclaration.name.getText() || '',
      excerptTokens, parameterTypeTokenRange
    }));
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiNamespace.getCanonicalReference(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiNamespace === undefined) {
      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodeToStopAt: ts.SyntaxKind.ModuleBlock  // ModuleBlock = the "{ ... }" block
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiNamespace = new ApiNamespace({ name, docComment, releaseTag, excerptTokens });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiNamespace);
  }

  private _processApiProperty(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;

    const canonicalReference: string = ApiProperty.getCanonicalReference(name, isStatic);

    let apiProperty: ApiProperty | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiProperty;

    if (apiProperty === undefined) {
      const propertyDeclaration: ts.PropertyDeclaration = astDeclaration.declaration as ts.PropertyDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: propertyDeclaration.type, tokenRange: propertyTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiProperty = new ApiProperty({ name, docComment, releaseTag, isStatic, excerptTokens, propertyTypeTokenRange });
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

    let apiPropertySignature: ApiPropertySignature | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiPropertySignature;

    if (apiPropertySignature === undefined) {
      const propertySignature: ts.PropertySignature = astDeclaration.declaration as ts.PropertySignature;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: propertySignature.type, tokenRange: propertyTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiPropertySignature = new ApiPropertySignature({ name, docComment, releaseTag,
        excerptTokens, propertyTypeTokenRange });
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
}
