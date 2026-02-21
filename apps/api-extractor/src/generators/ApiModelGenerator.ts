// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-bitwise */

import * as path from 'node:path';

import * as ts from 'typescript';

import type * as tsdoc from '@microsoft/tsdoc';
import {
  ApiModel,
  ApiClass,
  ApiPackage,
  ApiEntryPoint,
  ApiMethod,
  ApiNamespace,
  ApiInterface,
  ApiPropertySignature,
  type ApiItemContainerMixin,
  ReleaseTag,
  ApiProperty,
  ApiMethodSignature,
  type IApiParameterOptions,
  ApiEnum,
  ApiEnumMember,
  type IExcerptTokenRange,
  type IExcerptToken,
  ApiConstructor,
  ApiConstructSignature,
  ApiFunction,
  ApiIndexSignature,
  ApiVariable,
  ApiTypeAlias,
  ApiCallSignature,
  type IApiTypeParameterOptions,
  EnumMemberOrder
} from '@microsoft/api-extractor-model';
import { Path } from '@rushstack/node-core-library';

import type { Collector } from '../collector/Collector.ts';
import type { ISourceLocation } from '../collector/SourceMapper.ts';
import type { AstDeclaration } from '../analyzer/AstDeclaration.ts';
import { ExcerptBuilder, type IExcerptBuilderNodeTransform } from './ExcerptBuilder.ts';
import { AstSymbol } from '../analyzer/AstSymbol.ts';
import { DeclarationReferenceGenerator } from './DeclarationReferenceGenerator.ts';
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.ts';
import type { DeclarationMetadata } from '../collector/DeclarationMetadata.ts';
import { AstNamespaceImport } from '../analyzer/AstNamespaceImport.ts';
import type { AstEntity } from '../analyzer/AstEntity.ts';
import type { AstModule } from '../analyzer/AstModule.ts';
import { TypeScriptInternals } from '../analyzer/TypeScriptInternals.ts';
import type { ExtractorConfig } from '../api/ExtractorConfig.ts';
import { DtsEmitHelpers } from './DtsEmitHelpers.ts';

interface IProcessAstEntityContext {
  name: string;
  isExported: boolean;
  parentApiItem: ApiItemContainerMixin;
}

/**
 * @beta
 */
export interface IApiModelGenerationOptions {
  /**
   * The release tags to trim.
   */
  releaseTagsToTrim: Set<ReleaseTag>;
}

export class ApiModelGenerator {
  private readonly _collector: Collector;
  private readonly _apiModel: ApiModel;
  private readonly _referenceGenerator: DeclarationReferenceGenerator;
  private readonly _releaseTagsToTrim: Set<ReleaseTag> | undefined;

  public readonly docModelEnabled: boolean;

  public constructor(collector: Collector, extractorConfig: ExtractorConfig) {
    this._collector = collector;
    this._apiModel = new ApiModel();
    this._referenceGenerator = new DeclarationReferenceGenerator(collector);

    const apiModelGenerationOptions: IApiModelGenerationOptions | undefined =
      extractorConfig.docModelGenerationOptions;
    if (apiModelGenerationOptions) {
      this._releaseTagsToTrim = apiModelGenerationOptions.releaseTagsToTrim;
      this.docModelEnabled = true;
    } else {
      this.docModelEnabled = false;
    }
  }

  public get apiModel(): ApiModel {
    return this._apiModel;
  }

  public buildApiPackage(): ApiPackage {
    const packageDocComment: tsdoc.DocComment | undefined = this._collector.workingPackage.tsdocComment;

    const apiPackage: ApiPackage = new ApiPackage({
      name: this._collector.workingPackage.name,
      docComment: packageDocComment,
      tsdocConfiguration: this._collector.extractorConfig.tsdocConfiguration,
      projectFolderUrl: this._collector.extractorConfig.projectFolderUrl
    });
    this._apiModel.addMember(apiPackage);

    const apiEntryPoint: ApiEntryPoint = new ApiEntryPoint({ name: '' });
    apiPackage.addMember(apiEntryPoint);

    for (const entity of this._collector.entities) {
      // Only process entities that are exported from the entry point. Entities that are exported from
      // `AstNamespaceImport` entities will be processed by `_processAstNamespaceImport`. However, if
      // we are including forgotten exports, then process everything.
      if (entity.exportedFromEntryPoint || this._collector.extractorConfig.docModelIncludeForgottenExports) {
        this._processAstEntity(entity.astEntity, {
          name: entity.nameForEmit!,
          isExported: entity.exportedFromEntryPoint,
          parentApiItem: apiEntryPoint
        });
      }
    }

    return apiPackage;
  }

  private _processAstEntity(astEntity: AstEntity, context: IProcessAstEntityContext): void {
    if (astEntity instanceof AstSymbol) {
      // Skip ancillary declarations; we will process them with the main declaration
      for (const astDeclaration of this._collector.getNonAncillaryDeclarations(astEntity)) {
        this._processDeclaration(astDeclaration, context);
      }
      return;
    }

    if (astEntity instanceof AstNamespaceImport) {
      // Note that a single API item can belong to two different AstNamespaceImport namespaces.  For example:
      //
      //   // file.ts defines "thing()"
      //   import * as example1 from "./file";
      //   import * as example2 from "./file";
      //
      //   // ...so here we end up with example1.thing() and example2.thing()
      //   export { example1, example2 }
      //
      // The current logic does not try to associate "thing()" with a specific parent.  Instead
      // the API documentation will show duplicated entries for example1.thing() and example2.thing().
      //
      // This could be improved in the future, but it requires a stable mechanism for choosing an associated parent.
      // For thoughts about this:  https://github.com/microsoft/rushstack/issues/1308
      this._processAstNamespaceImport(astEntity, context);
      return;
    }

    // TODO: Figure out how to represent reexported AstImport objects.  Basically we need to introduce a new
    // ApiItem subclass for "export alias", similar to a type alias, but representing declarations of the
    // form "export { X } from 'external-package'".  We can also use this to solve GitHub issue #950.
  }

  private _processAstNamespaceImport(
    astNamespaceImport: AstNamespaceImport,
    context: IProcessAstEntityContext
  ): void {
    const astModule: AstModule = astNamespaceImport.astModule;
    const { name, isExported, parentApiItem } = context;
    const containerKey: string = ApiNamespace.getContainerKey(name);
    const fileUrlPath: string = this._getFileUrlPath(astNamespaceImport.declaration);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiNamespace;

    if (apiNamespace === undefined) {
      apiNamespace = new ApiNamespace({
        name,
        docComment: undefined,
        releaseTag: ReleaseTag.None,
        excerptTokens: [],
        isExported,
        fileUrlPath
      });
      parentApiItem.addMember(apiNamespace);
    }

    astModule.astModuleExportInfo!.exportedLocalEntities.forEach(
      (exportedEntity: AstEntity, exportedName: string) => {
        this._processAstEntity(exportedEntity, {
          name: exportedName,
          isExported: true,
          parentApiItem: apiNamespace!
        });
      }
    );
  }

  private _processDeclaration(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    if ((astDeclaration.modifierFlags & ts.ModifierFlags.Private) !== 0) {
      return; // trim out private declarations
    }

    const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
    const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
    if (this._releaseTagsToTrim?.has(releaseTag)) {
      return;
    }

    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.CallSignature:
        this._processApiCallSignature(astDeclaration, context);
        break;

      case ts.SyntaxKind.Constructor:
        this._processApiConstructor(astDeclaration, context);
        break;

      case ts.SyntaxKind.ConstructSignature:
        this._processApiConstructSignature(astDeclaration, context);
        break;

      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, context);
        break;

      case ts.SyntaxKind.EnumDeclaration:
        this._processApiEnum(astDeclaration, context);
        break;

      case ts.SyntaxKind.EnumMember:
        this._processApiEnumMember(astDeclaration, context);
        break;

      case ts.SyntaxKind.FunctionDeclaration:
        this._processApiFunction(astDeclaration, context);
        break;

      case ts.SyntaxKind.GetAccessor:
        this._processApiProperty(astDeclaration, context);
        break;

      case ts.SyntaxKind.SetAccessor:
        this._processApiProperty(astDeclaration, context);
        break;

      case ts.SyntaxKind.IndexSignature:
        this._processApiIndexSignature(astDeclaration, context);
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        this._processApiInterface(astDeclaration, context);
        break;

      case ts.SyntaxKind.MethodDeclaration:
        this._processApiMethod(astDeclaration, context);
        break;

      case ts.SyntaxKind.MethodSignature:
        this._processApiMethodSignature(astDeclaration, context);
        break;

      case ts.SyntaxKind.ModuleDeclaration:
        this._processApiNamespace(astDeclaration, context);
        break;

      case ts.SyntaxKind.PropertyDeclaration:
        this._processApiProperty(astDeclaration, context);
        break;

      case ts.SyntaxKind.PropertySignature:
        this._processApiPropertySignature(astDeclaration, context);
        break;

      case ts.SyntaxKind.TypeAliasDeclaration:
        this._processApiTypeAlias(astDeclaration, context);
        break;

      case ts.SyntaxKind.VariableDeclaration:
        // check for arrow functions in variable declaration
        const functionDeclaration: ts.FunctionDeclaration | undefined =
          this._tryFindFunctionDeclaration(astDeclaration);
        if (functionDeclaration) {
          this._processApiFunction(astDeclaration, context, functionDeclaration);
        } else {
          this._processApiVariable(astDeclaration, context);
        }
        break;

      default:
      // ignore unknown types
    }
  }

  private _tryFindFunctionDeclaration(astDeclaration: AstDeclaration): ts.FunctionDeclaration | undefined {
    const children: readonly ts.Node[] = astDeclaration.declaration.getChildren(
      astDeclaration.declaration.getSourceFile()
    );
    return children.find(ts.isFunctionTypeNode) as ts.FunctionDeclaration | undefined;
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, {
        ...context,
        name: childDeclaration.astSymbol.localName
      });
    }
  }

  private _processApiCallSignature(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { parentApiItem } = context;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiCallSignature.getContainerKey(overloadIndex);

    let apiCallSignature: ApiCallSignature | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiCallSignature;

    if (apiCallSignature === undefined) {
      const callSignature: ts.CallSignatureDeclaration =
        astDeclaration.declaration as ts.CallSignatureDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (callSignature.type) {
        nodeTransforms.push({ node: callSignature.type, captureTokenRange: returnTypeTokenRange });
      }

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        callSignature.typeParameters
      );

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        callSignature.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(callSignature);

      apiCallSignature = new ApiCallSignature({
        docComment,
        releaseTag,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        fileUrlPath
      });

      parentApiItem.addMember(apiCallSignature);
    }
  }

  private _processApiConstructor(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { parentApiItem } = context;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiConstructor.getContainerKey(overloadIndex);

    let apiConstructor: ApiConstructor | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiConstructor;

    if (apiConstructor === undefined) {
      const constructorDeclaration: ts.ConstructorDeclaration =
        astDeclaration.declaration as ts.ConstructorDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        constructorDeclaration.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isProtected: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Protected) !== 0;
      const fileUrlPath: string = this._getFileUrlPath(constructorDeclaration);

      apiConstructor = new ApiConstructor({
        docComment,
        releaseTag,
        isProtected,
        parameters,
        overloadIndex,
        excerptTokens,
        fileUrlPath
      });

      parentApiItem.addMember(apiConstructor);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;
    const containerKey: string = ApiClass.getContainerKey(name);

    let apiClass: ApiClass | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiClass;

    if (apiClass === undefined) {
      const classDeclaration: ts.ClassDeclaration = astDeclaration.declaration as ts.ClassDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        classDeclaration.typeParameters
      );

      let extendsTokenRange: IExcerptTokenRange | undefined = undefined;
      const implementsTokenRanges: IExcerptTokenRange[] = [];

      for (const heritageClause of classDeclaration.heritageClauses || []) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsTokenRange = ExcerptBuilder.createEmptyTokenRange();
          if (heritageClause.types.length > 0) {
            nodeTransforms.push({ node: heritageClause.types[0], captureTokenRange: extendsTokenRange });
          }
        } else if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const heritageType of heritageClause.types) {
            const implementsTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
            implementsTokenRanges.push(implementsTokenRange);
            nodeTransforms.push({ node: heritageType, captureTokenRange: implementsTokenRange });
          }
        }
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isAbstract: boolean =
        (ts.getCombinedModifierFlags(classDeclaration) & ts.ModifierFlags.Abstract) !== 0;
      const fileUrlPath: string = this._getFileUrlPath(classDeclaration);

      apiClass = new ApiClass({
        name,
        isAbstract,
        docComment,
        releaseTag,
        excerptTokens,
        typeParameters,
        extendsTokenRange,
        implementsTokenRanges,
        isExported,
        fileUrlPath
      });

      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, {
      ...context,
      parentApiItem: apiClass
    });
  }

  private _processApiConstructSignature(
    astDeclaration: AstDeclaration,
    context: IProcessAstEntityContext
  ): void {
    const { parentApiItem } = context;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiConstructSignature.getContainerKey(overloadIndex);

    let apiConstructSignature: ApiConstructSignature | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiConstructSignature;

    if (apiConstructSignature === undefined) {
      const constructSignature: ts.ConstructSignatureDeclaration =
        astDeclaration.declaration as ts.ConstructSignatureDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (constructSignature.type) {
        nodeTransforms.push({ node: constructSignature.type, captureTokenRange: returnTypeTokenRange });
      }

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        constructSignature.typeParameters
      );

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        constructSignature.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(constructSignature);

      apiConstructSignature = new ApiConstructSignature({
        docComment,
        releaseTag,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        fileUrlPath
      });

      parentApiItem.addMember(apiConstructSignature);
    }
  }

  private _processApiEnum(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;
    const containerKey: string = ApiEnum.getContainerKey(name);

    let apiEnum: ApiEnum | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiEnum;

    if (apiEnum === undefined) {
      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, []);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const preserveMemberOrder: boolean =
        this._collector.extractorConfig.enumMemberOrder === EnumMemberOrder.Preserve;
      const fileUrlPath: string = this._getFileUrlPath(astDeclaration.declaration);

      apiEnum = new ApiEnum({
        name,
        docComment,
        releaseTag,
        excerptTokens,
        preserveMemberOrder,
        isExported,
        fileUrlPath
      });
      parentApiItem.addMember(apiEnum);
    }

    this._processChildDeclarations(astDeclaration, {
      ...context,
      parentApiItem: apiEnum
    });
  }

  private _processApiEnumMember(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, parentApiItem } = context;
    const containerKey: string = ApiEnumMember.getContainerKey(name);

    let apiEnumMember: ApiEnumMember | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiEnumMember;

    if (apiEnumMember === undefined) {
      const enumMember: ts.EnumMember = astDeclaration.declaration as ts.EnumMember;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      let initializerTokenRange: IExcerptTokenRange | undefined = undefined;
      if (enumMember.initializer) {
        initializerTokenRange = ExcerptBuilder.createEmptyTokenRange();
        nodeTransforms.push({ node: enumMember.initializer, captureTokenRange: initializerTokenRange });
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(enumMember);

      apiEnumMember = new ApiEnumMember({
        name,
        docComment,
        releaseTag,
        excerptTokens,
        initializerTokenRange,
        fileUrlPath
      });

      parentApiItem.addMember(apiEnumMember);
    }
  }

  private _processApiFunction(
    astDeclaration: AstDeclaration,
    context: IProcessAstEntityContext,
    altFunctionDeclaration?: ts.FunctionDeclaration
  ): void {
    const { name, isExported, parentApiItem } = context;

    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiFunction.getContainerKey(name, overloadIndex);

    let apiFunction: ApiFunction | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiFunction;

    if (apiFunction === undefined) {
      const functionDeclaration: ts.FunctionDeclaration =
        altFunctionDeclaration ?? (astDeclaration.declaration as ts.FunctionDeclaration);

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (functionDeclaration.type) {
        nodeTransforms.push({ node: functionDeclaration.type, captureTokenRange: returnTypeTokenRange });
      }

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        functionDeclaration.typeParameters
      );

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        functionDeclaration.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(functionDeclaration);

      apiFunction = new ApiFunction({
        name,
        docComment,
        releaseTag,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        isExported,
        fileUrlPath
      });

      parentApiItem.addMember(apiFunction);
    }
  }

  private _processApiIndexSignature(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { parentApiItem } = context;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiIndexSignature.getContainerKey(overloadIndex);

    let apiIndexSignature: ApiIndexSignature | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiIndexSignature;

    if (apiIndexSignature === undefined) {
      const indexSignature: ts.IndexSignatureDeclaration =
        astDeclaration.declaration as ts.IndexSignatureDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodeTransforms.push({ node: indexSignature.type, captureTokenRange: returnTypeTokenRange });

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        indexSignature.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isReadonly: boolean = this._isReadonly(astDeclaration);
      const fileUrlPath: string = this._getFileUrlPath(indexSignature);

      apiIndexSignature = new ApiIndexSignature({
        docComment,
        releaseTag,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        isReadonly,
        fileUrlPath
      });

      parentApiItem.addMember(apiIndexSignature);
    }
  }

  private _processApiInterface(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;
    const containerKey: string = ApiInterface.getContainerKey(name);

    let apiInterface: ApiInterface | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiInterface;

    if (apiInterface === undefined) {
      const interfaceDeclaration: ts.InterfaceDeclaration =
        astDeclaration.declaration as ts.InterfaceDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        interfaceDeclaration.typeParameters
      );

      const extendsTokenRanges: IExcerptTokenRange[] = [];

      for (const heritageClause of interfaceDeclaration.heritageClauses || []) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const heritageType of heritageClause.types) {
            const extendsTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
            extendsTokenRanges.push(extendsTokenRange);
            nodeTransforms.push({ node: heritageType, captureTokenRange: extendsTokenRange });
          }
        }
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(interfaceDeclaration);

      apiInterface = new ApiInterface({
        name,
        docComment,
        releaseTag,
        excerptTokens,
        typeParameters,
        extendsTokenRanges,
        isExported,
        fileUrlPath
      });

      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, {
      ...context,
      parentApiItem: apiInterface
    });
  }

  private _processApiMethod(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, parentApiItem } = context;
    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiMethod.getContainerKey(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiMethod;

    if (apiMethod === undefined) {
      const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (methodDeclaration.type) {
        nodeTransforms.push({ node: methodDeclaration.type, captureTokenRange: returnTypeTokenRange });
      }

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        methodDeclaration.typeParameters
      );

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        methodDeclaration.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      if (releaseTag === ReleaseTag.Internal || releaseTag === ReleaseTag.Alpha) {
        return; // trim out items marked as "@internal" or "@alpha"
      }
      const isOptional: boolean =
        (astDeclaration.astSymbol.followedSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      const isProtected: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Protected) !== 0;
      const isAbstract: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Abstract) !== 0;
      const fileUrlPath: string = this._getFileUrlPath(methodDeclaration);

      apiMethod = new ApiMethod({
        name,
        isAbstract,
        docComment,
        releaseTag,
        isProtected,
        isStatic,
        isOptional,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        fileUrlPath
      });

      parentApiItem.addMember(apiMethod);
    }
  }

  private _processApiMethodSignature(
    astDeclaration: AstDeclaration,
    context: IProcessAstEntityContext
  ): void {
    const { name, parentApiItem } = context;
    const overloadIndex: number = this._collector.getOverloadIndex(astDeclaration);
    const containerKey: string = ApiMethodSignature.getContainerKey(name, overloadIndex);

    let apiMethodSignature: ApiMethodSignature | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiMethodSignature;

    if (apiMethodSignature === undefined) {
      const methodSignature: ts.MethodSignature = astDeclaration.declaration as ts.MethodSignature;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (methodSignature.type) {
        nodeTransforms.push({ node: methodSignature.type, captureTokenRange: returnTypeTokenRange });
      }

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        methodSignature.typeParameters
      );

      const parameters: IApiParameterOptions[] = this._captureParameters(
        nodeTransforms,
        methodSignature.parameters
      );

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isOptional: boolean =
        (astDeclaration.astSymbol.followedSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      const fileUrlPath: string = this._getFileUrlPath(methodSignature);

      apiMethodSignature = new ApiMethodSignature({
        name,
        docComment,
        releaseTag,
        isOptional,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange,
        fileUrlPath
      });

      parentApiItem.addMember(apiMethodSignature);
    }
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;
    const containerKey: string = ApiNamespace.getContainerKey(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiNamespace;

    if (apiNamespace === undefined) {
      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, []);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(astDeclaration.declaration);

      apiNamespace = new ApiNamespace({
        name,
        docComment,
        releaseTag,
        excerptTokens,
        isExported,
        fileUrlPath
      });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, {
      ...context,
      parentApiItem: apiNamespace
    });
  }

  private _processApiProperty(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, parentApiItem } = context;
    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;
    const containerKey: string = ApiProperty.getContainerKey(name, isStatic);

    let apiProperty: ApiProperty | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiProperty;

    if (apiProperty === undefined) {
      const declaration: ts.Declaration = astDeclaration.declaration;
      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      let propertyTypeNode: ts.TypeNode | undefined;

      if (ts.isPropertyDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration)) {
        propertyTypeNode = declaration.type;
      }

      if (ts.isSetAccessorDeclaration(declaration)) {
        // Note that TypeScript always reports an error if a setter does not have exactly one parameter.
        propertyTypeNode = declaration.parameters[0].type;
      }

      if (propertyTypeNode) {
        nodeTransforms.push({ node: propertyTypeNode, captureTokenRange: propertyTypeTokenRange });
      }

      let initializerTokenRange: IExcerptTokenRange | undefined = undefined;
      if (ts.isPropertyDeclaration(declaration) && declaration.initializer) {
        initializerTokenRange = ExcerptBuilder.createEmptyTokenRange();
        nodeTransforms.push({ node: declaration.initializer, captureTokenRange: initializerTokenRange });
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isOptional: boolean =
        (astDeclaration.astSymbol.followedSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      const isProtected: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Protected) !== 0;
      const isAbstract: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Abstract) !== 0;
      const isReadonly: boolean = this._isReadonly(astDeclaration);
      const fileUrlPath: string = this._getFileUrlPath(declaration);

      apiProperty = new ApiProperty({
        name,
        docComment,
        releaseTag,
        isAbstract,
        isProtected,
        isStatic,
        isOptional,
        isReadonly,
        excerptTokens,
        propertyTypeTokenRange,
        initializerTokenRange,
        fileUrlPath
      });
      parentApiItem.addMember(apiProperty);
    } else {
      // If the property was already declared before (via a merged interface declaration),
      // we assume its signature is identical, because the language requires that.
    }
  }

  private _processApiPropertySignature(
    astDeclaration: AstDeclaration,
    context: IProcessAstEntityContext
  ): void {
    const { name, parentApiItem } = context;
    const containerKey: string = ApiPropertySignature.getContainerKey(name);

    let apiPropertySignature: ApiPropertySignature | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiPropertySignature;

    if (apiPropertySignature === undefined) {
      const propertySignature: ts.PropertySignature = astDeclaration.declaration as ts.PropertySignature;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (propertySignature.type) {
        nodeTransforms.push({ node: propertySignature.type, captureTokenRange: propertyTypeTokenRange });
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isOptional: boolean =
        (astDeclaration.astSymbol.followedSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      const isReadonly: boolean = this._isReadonly(astDeclaration);
      const fileUrlPath: string = this._getFileUrlPath(propertySignature);

      apiPropertySignature = new ApiPropertySignature({
        name,
        docComment,
        releaseTag,
        isOptional,
        excerptTokens,
        propertyTypeTokenRange,
        isReadonly,
        fileUrlPath
      });

      parentApiItem.addMember(apiPropertySignature);
    } else {
      // If the property was already declared before (via a merged interface declaration),
      // we assume its signature is identical, because the language requires that.
    }
  }

  private _processApiTypeAlias(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;

    const containerKey: string = ApiTypeAlias.getContainerKey(name);

    let apiTypeAlias: ApiTypeAlias | undefined = parentApiItem.tryGetMemberByKey(
      containerKey
    ) as ApiTypeAlias;

    if (apiTypeAlias === undefined) {
      const typeAliasDeclaration: ts.TypeAliasDeclaration =
        astDeclaration.declaration as ts.TypeAliasDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(
        nodeTransforms,
        typeAliasDeclaration.typeParameters
      );

      const typeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodeTransforms.push({ node: typeAliasDeclaration.type, captureTokenRange: typeTokenRange });

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const fileUrlPath: string = this._getFileUrlPath(typeAliasDeclaration);

      apiTypeAlias = new ApiTypeAlias({
        name,
        docComment,
        typeParameters,
        releaseTag,
        excerptTokens,
        typeTokenRange,
        isExported,
        fileUrlPath
      });

      parentApiItem.addMember(apiTypeAlias);
    }
  }

  private _processApiVariable(astDeclaration: AstDeclaration, context: IProcessAstEntityContext): void {
    const { name, isExported, parentApiItem } = context;

    const containerKey: string = ApiVariable.getContainerKey(name);

    let apiVariable: ApiVariable | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiVariable;

    if (apiVariable === undefined) {
      const variableDeclaration: ts.VariableDeclaration =
        astDeclaration.declaration as ts.VariableDeclaration;

      const nodeTransforms: IExcerptBuilderNodeTransform[] = [];

      const variableTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      if (variableDeclaration.type) {
        nodeTransforms.push({ node: variableDeclaration.type, captureTokenRange: variableTypeTokenRange });
      }

      let initializerTokenRange: IExcerptTokenRange | undefined = undefined;
      if (variableDeclaration.initializer) {
        initializerTokenRange = ExcerptBuilder.createEmptyTokenRange();
        nodeTransforms.push({
          node: variableDeclaration.initializer,
          captureTokenRange: initializerTokenRange
        });
      }

      const excerptTokens: IExcerptToken[] = this._buildExcerptTokens(astDeclaration, nodeTransforms);
      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
      const releaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;
      const isReadonly: boolean = this._isReadonly(astDeclaration);
      const fileUrlPath: string = this._getFileUrlPath(variableDeclaration);

      apiVariable = new ApiVariable({
        name,
        docComment,
        releaseTag,
        excerptTokens,
        variableTypeTokenRange,
        initializerTokenRange,
        isReadonly,
        isExported,
        fileUrlPath
      });

      parentApiItem.addMember(apiVariable);
    }
  }

  /**
   * @param nodeTransforms - A list of child nodes whose token ranges we want to capture
   */
  private _buildExcerptTokens(
    astDeclaration: AstDeclaration,
    nodeTransforms: IExcerptBuilderNodeTransform[]
  ): IExcerptToken[] {
    const excerptTokens: IExcerptToken[] = [];

    // Build the main declaration
    ExcerptBuilder.addDeclaration(excerptTokens, astDeclaration, nodeTransforms, this._referenceGenerator);

    const declarationMetadata: DeclarationMetadata = this._collector.fetchDeclarationMetadata(astDeclaration);

    // Add any ancillary declarations
    for (const ancillaryDeclaration of declarationMetadata.ancillaryDeclarations) {
      ExcerptBuilder.addBlankLine(excerptTokens);
      ExcerptBuilder.addDeclaration(
        excerptTokens,
        ancillaryDeclaration,
        nodeTransforms,
        this._referenceGenerator
      );
    }

    return excerptTokens;
  }

  private _captureTypeParameters(
    nodeTransforms: IExcerptBuilderNodeTransform[],
    typeParameterNodes: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
  ): IApiTypeParameterOptions[] {
    const typeParameters: IApiTypeParameterOptions[] = [];
    if (typeParameterNodes) {
      for (const typeParameter of typeParameterNodes) {
        const constraintTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
        if (typeParameter.constraint) {
          nodeTransforms.push({ node: typeParameter.constraint, captureTokenRange: constraintTokenRange });
        }

        const defaultTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
        if (typeParameter.default) {
          nodeTransforms.push({ node: typeParameter.default, captureTokenRange: defaultTypeTokenRange });
        }

        typeParameters.push({
          typeParameterName: typeParameter.name.getText().trim(),
          constraintTokenRange,
          defaultTypeTokenRange
        });
      }
    }
    return typeParameters;
  }

  private _captureParameters(
    nodeTransforms: IExcerptBuilderNodeTransform[],
    parameterNodes: ts.NodeArray<ts.ParameterDeclaration>
  ): IApiParameterOptions[] {
    const parameters: IApiParameterOptions[] = [];

    DtsEmitHelpers.forEachParameterToNormalize(
      parameterNodes,
      (parameter: ts.ParameterDeclaration, syntheticName: string | undefined): void => {
        const parameterTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
        if (parameter.type) {
          nodeTransforms.push({ node: parameter.type, captureTokenRange: parameterTypeTokenRange });
        }
        parameters.push({
          parameterName: syntheticName ?? parameter.name.getText().trim(),
          parameterTypeTokenRange,
          isOptional: this._collector.typeChecker.isOptionalParameter(parameter)
        });

        if (syntheticName !== undefined) {
          // Replace the subexpression like "{ y, z }" with the synthesized parameter name
          nodeTransforms.push({ node: parameter.name, replacementText: syntheticName });
        }
      }
    );

    return parameters;
  }

  private _isReadonly(astDeclaration: AstDeclaration): boolean {
    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.VariableDeclaration: {
        const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
        const docComment: tsdoc.DocComment | undefined = apiItemMetadata.tsdocComment;
        const declarationMetadata: DeclarationMetadata =
          this._collector.fetchDeclarationMetadata(astDeclaration);

        const hasReadonlyModifier: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Readonly) !== 0;
        const hasReadonlyDocTag: boolean = !!docComment?.modifierTagSet?.hasTagName('@readonly');
        const isGetterWithNoSetter: boolean =
          ts.isGetAccessorDeclaration(astDeclaration.declaration) &&
          declarationMetadata.ancillaryDeclarations.length === 0;
        const isVarConst: boolean =
          ts.isVariableDeclaration(astDeclaration.declaration) &&
          TypeScriptInternals.isVarConst(astDeclaration.declaration);

        return hasReadonlyModifier || hasReadonlyDocTag || isGetterWithNoSetter || isVarConst;
      }
      default: {
        // Readonly-ness does not make sense for any other declaration kind.
        return false;
      }
    }
  }

  private _getFileUrlPath(declaration: ts.Declaration): string {
    const sourceFile: ts.SourceFile = declaration.getSourceFile();
    const sourceLocation: ISourceLocation = this._collector.sourceMapper.getSourceLocation({
      sourceFile,
      pos: declaration.pos
    });

    let result: string = path.relative(
      this._collector.extractorConfig.projectFolder,
      sourceLocation.sourceFilePath
    );
    result = Path.convertToSlashes(result);
    return result;
  }
}
