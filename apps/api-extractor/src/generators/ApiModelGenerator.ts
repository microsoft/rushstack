// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable:no-bitwise

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';
import {
  ApiModel,
  ApiClass,
  ApiPackage,
  ApiEntryPoint,
  ApiMethod,
  ApiNamespace,
  ApiInterface,
  ApiPropertySignature,
  ApiItemContainerMixin,
  ReleaseTag,
  ApiProperty,
  ApiMethodSignature,
  IApiParameterOptions,
  ApiEnum,
  ApiEnumMember,
  IExcerptTokenRange,
  IExcerptToken,
  ApiConstructor,
  ApiConstructSignature,
  ApiFunction,
  ApiIndexSignature,
  ApiVariable,
  ApiTypeAlias,
  ApiCallSignature,
  IApiTypeParameterOptions
} from '@microsoft/api-extractor-model';

import { Collector } from '../collector/Collector';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ExcerptBuilder, IExcerptBuilderNodeToCapture } from './ExcerptBuilder';
import { AstSymbol } from '../analyzer/AstSymbol';
import { DeclarationReferenceGenerator } from './DeclarationReferenceGenerator';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';
import { SymbolMetadata } from '../collector/SymbolMetadata';

export class ApiModelGenerator {
  private readonly _collector: Collector;
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;
  private readonly _apiModel: ApiModel;
  private readonly _referenceGenerator: DeclarationReferenceGenerator;

  public constructor(collector: Collector) {
    this._collector = collector;
    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
    this._apiModel = new ApiModel();
    this._referenceGenerator = new DeclarationReferenceGenerator(
      collector.packageJsonLookup,
      collector.workingPackage.name,
      collector.program,
      collector.typeChecker);
  }

  public get apiModel(): ApiModel {
    return this._apiModel;
  }

  public buildApiPackage(): ApiPackage {
    const packageDocComment: tsdoc.DocComment | undefined = this._collector.workingPackage.tsdocComment;

    const apiPackage: ApiPackage = new ApiPackage({
      name: this._collector.workingPackage.name,
      docComment: packageDocComment
    });
    this._apiModel.addMember(apiPackage);

    const apiEntryPoint: ApiEntryPoint = new ApiEntryPoint({ name: '' });
    apiPackage.addMember(apiEntryPoint);

    // Create a CollectorEntity for each top-level export
    for (const entity of this._collector.entities) {
      if (entity.exported) {
        if (entity.astEntity instanceof AstSymbol) {
          for (const astDeclaration of entity.astEntity.astDeclarations) {
            this._processDeclaration(astDeclaration, entity.nameForEmit, apiEntryPoint);
          }
        } else {
          // TODO: Figure out how to represent reexported AstImport objects.  Basically we need to introduce a new
          // ApiItem subclass for "export alias", similar to a type alias, but representing declarations of the
          // form "export { X } from 'external-package'".  We can also use this to solve GitHub issue #950.
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
      case ts.SyntaxKind.CallSignature:
        this._processApiCallSignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.Constructor:
        this._processApiConstructor(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.ConstructSignature:
        this._processApiConstructSignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.EnumDeclaration:
        this._processApiEnum(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.EnumMember:
        this._processApiEnumMember(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.FunctionDeclaration:
        this._processApiFunction(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.IndexSignature:
        this._processApiIndexSignature(astDeclaration, exportedName, parentApiItem);
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

      case ts.SyntaxKind.TypeAliasDeclaration:
        this._processApiTypeAlias(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.VariableDeclaration:
        this._processApiVariable(astDeclaration, exportedName, parentApiItem);
        break;

      default:
        // ignore unknown types
    }
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, undefined, parentApiItem);
    }
  }

  private _processApiCallSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiCallSignature.getContainerKey(overloadIndex);

    let apiCallSignature: ApiCallSignature | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiCallSignature;

    if (apiCallSignature === undefined) {
      const callSignature: ts.CallSignatureDeclaration = astDeclaration.declaration as ts.CallSignatureDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: callSignature.type, tokenRange: returnTypeTokenRange });

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        callSignature.typeParameters);

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture, callSignature.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiCallSignature = new ApiCallSignature({ docComment, releaseTag, typeParameters, parameters, overloadIndex,
        excerptTokens, returnTypeTokenRange });

      parentApiItem.addMember(apiCallSignature);
    }
  }

  private _processApiConstructor(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiConstructor.getContainerKey(overloadIndex);

    let apiConstructor: ApiConstructor | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiConstructor;

    if (apiConstructor === undefined) {
      const constructorDeclaration: ts.ConstructorDeclaration = astDeclaration.declaration as ts.ConstructorDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture,
        constructorDeclaration.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiConstructor = new ApiConstructor({ docComment, releaseTag, parameters, overloadIndex,
        excerptTokens });

      parentApiItem.addMember(apiConstructor);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const containerKey: string = ApiClass.getContainerKey(name);

    let apiClass: ApiClass | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiClass;

    if (apiClass === undefined) {
      const classDeclaration: ts.ClassDeclaration = astDeclaration.declaration as ts.ClassDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        classDeclaration.typeParameters);

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
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        stopBeforeChildKind: ts.SyntaxKind.FirstPunctuation,  // FirstPunctuation = "{"
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiClass = new ApiClass({ name, docComment, releaseTag, excerptTokens, typeParameters, extendsTokenRange,
        implementsTokenRanges });

      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiClass);
  }

  private _processApiConstructSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiConstructSignature.getContainerKey(overloadIndex);

    let apiConstructSignature: ApiConstructSignature | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiConstructSignature;

    if (apiConstructSignature === undefined) {
      const constructSignature: ts.ConstructSignatureDeclaration = astDeclaration.declaration as
        ts.ConstructSignatureDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: constructSignature.type, tokenRange: returnTypeTokenRange });

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        constructSignature.typeParameters);

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture, constructSignature.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiConstructSignature = new ApiConstructSignature({ docComment, releaseTag, typeParameters, parameters,
        overloadIndex, excerptTokens, returnTypeTokenRange });

      parentApiItem.addMember(apiConstructSignature);
    }
  }

  private _processApiEnum(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const containerKey: string = ApiEnum.getContainerKey(name);

    let apiEnum: ApiEnum | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiEnum;

    if (apiEnum === undefined) {
      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        stopBeforeChildKind: ts.SyntaxKind.FirstPunctuation  // FirstPunctuation = "{"
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
    const containerKey: string = ApiEnumMember.getContainerKey(name);

    let apiEnumMember: ApiEnumMember | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiEnumMember;

    if (apiEnumMember === undefined) {
      const enumMember: ts.EnumMember = astDeclaration.declaration as ts.EnumMember;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const initializerTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: enumMember.initializer, tokenRange: initializerTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
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

  private _processApiFunction(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiFunction.getContainerKey(name, overloadIndex);

    let apiFunction: ApiFunction | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiFunction;

    if (apiFunction === undefined) {
      const functionDeclaration: ts.FunctionDeclaration = astDeclaration.declaration as ts.FunctionDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: functionDeclaration.type, tokenRange: returnTypeTokenRange });

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        functionDeclaration.typeParameters);

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture,
        functionDeclaration.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const declarationMetadata: DeclarationMetadata = this._collector.fetchMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = declarationMetadata.tsdocComment;
      const effectiveReleaseTag: ReleaseTag = declarationMetadata.effectiveReleaseTag;
      if (effectiveReleaseTag === ReleaseTag.Internal || effectiveReleaseTag === ReleaseTag.Alpha) {
        return; // trim out items marked as "@internal" or "@alpha"
      }
      // If we have lower-release function overloads, include that information
      const symbolMetadata: SymbolMetadata = this._collector.fetchMetadata(astDeclaration.astSymbol);
      const releaseTag: ReleaseTag = (
        effectiveReleaseTag !== ReleaseTag.None &&
        effectiveReleaseTag < symbolMetadata.releaseTag
      )
        ? effectiveReleaseTag
        : symbolMetadata.releaseTag;

      apiFunction = new ApiFunction({
        name,
        docComment,
        releaseTag,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange
      });

      parentApiItem.addMember(apiFunction);
    }
  }

  private _processApiIndexSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiIndexSignature.getContainerKey(overloadIndex);

    let apiIndexSignature: ApiIndexSignature | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
    ApiIndexSignature;

    if (apiIndexSignature === undefined) {
      const indexSignature: ts.IndexSignatureDeclaration = astDeclaration.declaration as ts.IndexSignatureDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: indexSignature.type, tokenRange: returnTypeTokenRange });

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture, indexSignature.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiIndexSignature = new ApiIndexSignature({ docComment, releaseTag, parameters, overloadIndex,
        excerptTokens, returnTypeTokenRange });

      parentApiItem.addMember(apiIndexSignature);
    }
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const containerKey: string = ApiInterface.getContainerKey(name);

    let apiInterface: ApiInterface | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiInterface;

    if (apiInterface === undefined) {
      const interfaceDeclaration: ts.InterfaceDeclaration = astDeclaration.declaration as ts.InterfaceDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        interfaceDeclaration.typeParameters);

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
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        stopBeforeChildKind: ts.SyntaxKind.FirstPunctuation,  // FirstPunctuation = "{"
        nodesToCapture
      });

      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiInterface = new ApiInterface({ name, docComment, releaseTag, excerptTokens, typeParameters,
        extendsTokenRanges });

      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const isStatic: boolean = (astDeclaration.modifierFlags & ts.ModifierFlags.Static) !== 0;
    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiMethod.getContainerKey(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiMethod;

    if (apiMethod === undefined) {
      const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: methodDeclaration.type, tokenRange: returnTypeTokenRange });

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        methodDeclaration.typeParameters);

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture, methodDeclaration.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const declarationMetadata: DeclarationMetadata = this._collector.fetchMetadata(astDeclaration);
      const docComment: tsdoc.DocComment | undefined = declarationMetadata.tsdocComment;
      const effectiveReleaseTag: ReleaseTag = declarationMetadata.effectiveReleaseTag;
      if (effectiveReleaseTag === ReleaseTag.Internal || effectiveReleaseTag === ReleaseTag.Alpha) {
        return; // trim out items marked as "@internal" or "@alpha"
      }
      // If we have lower-release function overloads, include that information
      const symbolMetadata: SymbolMetadata = this._collector.fetchMetadata(astDeclaration.astSymbol);
      const releaseTag: ReleaseTag = (
        effectiveReleaseTag !== ReleaseTag.None &&
        effectiveReleaseTag < symbolMetadata.releaseTag
      )
        ? effectiveReleaseTag
        : symbolMetadata.releaseTag;

      apiMethod = new ApiMethod({
        name,
        docComment,
        releaseTag,
        isStatic,
        typeParameters,
        parameters,
        overloadIndex,
        excerptTokens,
        returnTypeTokenRange
      });

      parentApiItem.addMember(apiMethod);
    }
  }

  private _processApiMethodSignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const containerKey: string = ApiMethodSignature.getContainerKey(name, overloadIndex);

    let apiMethodSignature: ApiMethodSignature | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiMethodSignature;

    if (apiMethodSignature === undefined) {
      const methodSignature: ts.MethodSignature = astDeclaration.declaration as ts.MethodSignature;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const returnTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: methodSignature.type, tokenRange: returnTypeTokenRange });

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        methodSignature.typeParameters);

      const parameters: IApiParameterOptions[] = this._captureParameters(nodesToCapture, methodSignature.parameters);

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiMethodSignature = new ApiMethodSignature({ name, docComment, releaseTag, typeParameters, parameters,
        overloadIndex, excerptTokens, returnTypeTokenRange });

      parentApiItem.addMember(apiMethodSignature);
    }
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const containerKey: string = ApiNamespace.getContainerKey(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMemberByKey(containerKey) as ApiNamespace;

    if (apiNamespace === undefined) {
      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        stopBeforeChildKind: ts.SyntaxKind.ModuleBlock  // ModuleBlock = the "{ ... }" block
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

    const containerKey: string = ApiProperty.getContainerKey(name, isStatic);

    let apiProperty: ApiProperty | undefined
      = parentApiItem.tryGetMemberByKey(containerKey) as ApiProperty;

    if (apiProperty === undefined) {
      const propertyDeclaration: ts.PropertyDeclaration = astDeclaration.declaration as ts.PropertyDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: propertyDeclaration.type, tokenRange: propertyTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
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
    const containerKey: string = ApiPropertySignature.getContainerKey(name);

    let apiPropertySignature: ApiPropertySignature | undefined
      = parentApiItem.tryGetMemberByKey(containerKey) as ApiPropertySignature;

    if (apiPropertySignature === undefined) {
      const propertySignature: ts.PropertySignature = astDeclaration.declaration as ts.PropertySignature;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const propertyTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: propertySignature.type, tokenRange: propertyTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
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

  private _processApiTypeAlias(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const containerKey: string = ApiTypeAlias.getContainerKey(name);

    let apiTypeAlias: ApiTypeAlias | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiTypeAlias;

    if (apiTypeAlias === undefined) {
      const typeAliasDeclaration: ts.TypeAliasDeclaration = astDeclaration.declaration as ts.TypeAliasDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const typeParameters: IApiTypeParameterOptions[] = this._captureTypeParameters(nodesToCapture,
        typeAliasDeclaration.typeParameters);

      const typeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: typeAliasDeclaration.type, tokenRange: typeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiTypeAlias = new ApiTypeAlias({ name, docComment, typeParameters, releaseTag, excerptTokens,
        typeTokenRange });

      parentApiItem.addMember(apiTypeAlias);
    }
  }

  private _processApiVariable(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const containerKey: string = ApiVariable.getContainerKey(name);

    let apiVariable: ApiVariable | undefined = parentApiItem.tryGetMemberByKey(containerKey) as
      ApiVariable;

    if (apiVariable === undefined) {
      const variableDeclaration: ts.VariableDeclaration = astDeclaration.declaration as ts.VariableDeclaration;

      const nodesToCapture: IExcerptBuilderNodeToCapture[] = [];

      const variableTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: variableDeclaration.type, tokenRange: variableTypeTokenRange });

      const excerptTokens: IExcerptToken[] = ExcerptBuilder.build({
        referenceGenerator: this._referenceGenerator,
        startingNode: astDeclaration.declaration,
        nodesToCapture
      });
      const docComment: tsdoc.DocComment | undefined = this._collector.fetchMetadata(astDeclaration).tsdocComment;
      const releaseTag: ReleaseTag = this._collector.fetchMetadata(astDeclaration.astSymbol).releaseTag;

      apiVariable = new ApiVariable({ name, docComment, releaseTag, excerptTokens, variableTypeTokenRange });

      parentApiItem.addMember(apiVariable);
    }
  }

  private _captureTypeParameters(nodesToCapture: IExcerptBuilderNodeToCapture[], typeParameterNodes:
    ts.NodeArray<ts.TypeParameterDeclaration> | undefined): IApiTypeParameterOptions[] {

    const typeParameters: IApiTypeParameterOptions[] = [];
    if (typeParameterNodes) {
      for (const typeParameter of typeParameterNodes) {
        const constraintTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
        nodesToCapture.push({ node: typeParameter.constraint, tokenRange: constraintTokenRange });

        const defaultTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
        nodesToCapture.push({ node: typeParameter.default, tokenRange: defaultTypeTokenRange });

        typeParameters.push({
          typeParameterName: typeParameter.name.getText().trim(),
          constraintTokenRange,
          defaultTypeTokenRange
        });
      }
    }
    return typeParameters;
  }

  private _captureParameters(nodesToCapture: IExcerptBuilderNodeToCapture[],
    parameterNodes: ts.NodeArray<ts.ParameterDeclaration>): IApiParameterOptions[] {

    const parameters: IApiParameterOptions[] = [];
    for (const parameter of parameterNodes) {
      const parameterTypeTokenRange: IExcerptTokenRange = ExcerptBuilder.createEmptyTokenRange();
      nodesToCapture.push({ node: parameter.type, tokenRange: parameterTypeTokenRange });
      parameters.push({
        parameterName: parameter.name.getText().trim(),
        parameterTypeTokenRange
      });
    }
    return parameters;
  }

  private _getOverloadIndex(astDeclaration: AstDeclaration): number {
    const allDeclarations: ReadonlyArray<AstDeclaration> = astDeclaration.astSymbol.astDeclarations;
    if (allDeclarations.length === 1) {
      return 1; // trivial case
    }

    let overloadIndex: number | undefined = this._cachedOverloadIndexesByDeclaration.get(astDeclaration);

    if (overloadIndex === undefined) {
      // TSDoc index selectors are positive integers counting from 1
      let nextIndex: number = 1;
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
