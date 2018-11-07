// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { ExtractorContext } from '../analyzer/ExtractorContext';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntryPoint } from '../analyzer/AstEntryPoint';
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
import { AedocDefinitions } from '../aedoc/AedocDefinitions';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { PackageDocComment } from '../aedoc/PackageDocComment';
import { ApiItemContainerMixin } from '../api/mixins/ApiItemContainerMixin';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { ApiReleaseTagMixin } from '../api/mixins/ApiReleaseTagMixin';
import { ApiProperty } from '../api/model/ApiProperty';
import { ApiMethodSignature } from '../api/model/ApiMethodSignature';

export class ModelBuilder {
  private readonly _context: ExtractorContext;
  private readonly _tsdocParser: tsdoc.TSDocParser;
  private readonly _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;
  private readonly _apiModel: ApiModel;

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._tsdocParser = new tsdoc.TSDocParser(AedocDefinitions.tsdocConfiguration);
    this._astSymbolTable = new AstSymbolTable(this._context.typeChecker, this._context.packageJsonLookup);
    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
    this._apiModel = new ApiModel();
  }

  public get apiModel(): ApiModel {
    return this._apiModel;
  }

  public buildApiPackage(): ApiPackage {
    let packageDocComment: tsdoc.DocComment | undefined = undefined;

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment.tryFindInSourceFile(
      this._context.entryPointSourceFile, this._context);

    if (packageDocCommentTextRange) {
      packageDocComment = this._parseTsdocComment(this._context.entryPointSourceFile.text, packageDocCommentTextRange);
    }

    const apiPackage: ApiPackage = new ApiPackage({
      name: this._context.packageName,
      docComment: packageDocComment
    });
    this._apiModel.addMember(apiPackage);

    const apiEntryPoint: ApiEntryPoint = new ApiEntryPoint({ name: '' });
    apiPackage.addMember(apiEntryPoint);

    // Build the entry point
    this._astEntryPoint = this._astSymbolTable.fetchEntryPoint(this._context.entryPointSourceFile);

    // Create a DtsEntry for each top-level export
    for (const exportedMember of this._astEntryPoint.exportedMembers) {
      for (const astDeclaration of exportedMember.astSymbol.astDeclarations) {
        this._processDeclaration(astDeclaration, exportedMember.name, apiEntryPoint);
      }
    }

    return apiPackage;
  }

  private _processDeclaration(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    switch (astDeclaration.declaration.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        this._processApiClass(astDeclaration, exportedName, parentApiItem);
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
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
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
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);

      apiClass = new ApiClass({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiClass);
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiInterface.getCanonicalReference(name);

    let apiInterface: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiInterface;

    if (apiInterface === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation); // FirstPunctuation = "{"
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);

      apiInterface = new ApiInterface({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const methodDeclaration: ts.MethodDeclaration = astDeclaration.declaration as ts.MethodDeclaration;

    let isStatic: boolean = false;
    if (methodDeclaration.modifiers) {
      for (const modifier of methodDeclaration.modifiers) {
        if (modifier.kind === ts.SyntaxKind.StaticKeyword) {
          isStatic = true;
        }
      }
    }

    const overloadIndex: number = this._getOverloadIndex(astDeclaration);
    const canonicalReference: string = ApiMethod.getCanonicalReference(name, isStatic, overloadIndex);

    let apiMethod: ApiMethod | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiMethod;

    if (apiMethod === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);
      const resultTypeSignature: string = this._getSignatureForTypeNode(methodDeclaration.type);

      apiMethod = new ApiMethod({ name, signature, docComment, releaseTag, resultTypeSignature, isStatic,
        overloadIndex });

      for (const parameter of methodDeclaration.parameters) {
        const parameterSignature: string = parameter.getText().trim();

        apiMethod.addParameter(new ApiParameter({
          name: parameter.name.getText() || '',
          signature: parameterSignature
        }));
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
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);
      const resultTypeSignature: string = this._getSignatureForTypeNode(methodSignature.type);

      apiMethodSignature = new ApiMethodSignature({ name, signature, docComment, releaseTag, resultTypeSignature,
        overloadIndex });

      for (const parameter of methodSignature.parameters) {
        const parameterSignature: string = parameter.getText().trim();

        apiMethodSignature.addParameter(new ApiParameter({
          name: parameter.name.getText() || '',
          signature: parameterSignature
        }));
      }

      parentApiItem.addMember(apiMethodSignature);
    }
  }

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiNamespace.getCanonicalReference(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiNamespace === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.ModuleBlock); // ModuleBlock = the "{ ... }" block
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);

      apiNamespace = new ApiNamespace({ name, signature, docComment, releaseTag });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiNamespace);
  }

  private _processApiProperty(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: ApiItemContainerMixin): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;

    const propertyDeclaration: ts.PropertyDeclaration = astDeclaration.declaration as ts.PropertyDeclaration;

    let isStatic: boolean = false;
    if (propertyDeclaration.modifiers) {
      for (const modifier of propertyDeclaration.modifiers) {
        if (modifier.kind === ts.SyntaxKind.StaticKeyword) {
          isStatic = true;
        }
      }
    }

    const canonicalReference: string = ApiProperty.getCanonicalReference(name, isStatic);

    let apiProperty: ApiProperty | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiProperty;

    if (apiProperty === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);
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
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);
      const releaseTag: ReleaseTag = this._determineReleaseTag(docComment, parentApiItem);
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

  private _determineReleaseTag(docComment: tsdoc.DocComment | undefined,
    parentApiItem?: ApiItemContainerMixin): ReleaseTag {

    let releaseTag: ReleaseTag = ReleaseTag.None;

    if (docComment) {
      const modifierTagSet: tsdoc.StandardModifierTagSet = docComment.modifierTagSet;
      let inconsistentReleaseTags: boolean = false;

      if (modifierTagSet.isPublic()) {
        releaseTag = ReleaseTag.Public;
      }
      if (modifierTagSet.isBeta()) {
        if (releaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          releaseTag = ReleaseTag.Beta;
        }
      }
      if (modifierTagSet.isAlpha()) {
        if (releaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          releaseTag = ReleaseTag.Alpha;
        }
      }
      if (modifierTagSet.isInternal()) {
        if (releaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          releaseTag = ReleaseTag.Internal;
        }
      }

      if (inconsistentReleaseTags) {
        // TODO: Report error message
        this._context.reportError('Inconsistent release tags', undefined, undefined);
      }
    }

    if (releaseTag !== ReleaseTag.None) {
      return releaseTag;
    }

    if (parentApiItem && ApiReleaseTagMixin.isBaseClassOf(parentApiItem)) {
      return parentApiItem.releaseTag;
    }

    return ReleaseTag.Public;
  }

  private _tryParseDocumentation(astDeclaration: AstDeclaration): tsdoc.DocComment | undefined {
    const declaration: ts.Declaration = astDeclaration.declaration;
    const sourceFileText: string = declaration.getSourceFile().text;
    const ranges: ts.CommentRange[] = TypeScriptHelpers.getJSDocCommentRanges(declaration, sourceFileText) || [];

    if (ranges.length === 0) {
      return undefined;
    }

    // We use the JSDoc comment block that is closest to the definition, i.e.
    // the last one preceding it
    return this._parseTsdocComment(sourceFileText, ranges[ranges.length - 1]);
  }

  private _parseTsdocComment(sourceFile: string, textRange: ts.TextRange): tsdoc.DocComment | undefined {
    const tsdocTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(sourceFile,
      textRange.pos, textRange.end);

    const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(tsdocTextRange);
    return parserContext.docComment;
  }
}
