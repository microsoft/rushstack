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
import { IApiItemContainer } from '../api/mixins/ApiItemContainerMixin';
import { ApiInterface } from '../api/model/ApiInterface';
import { ApiPropertySignature } from '../api/model/ApiPropertySignature';
import { Span } from '../analyzer/Span';
import { ApiParameter } from '../api/model/ApiParameter';
import { AedocDefinitions } from '../aedoc/AedocDefinitions';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';

export class ModelBuilder {
  private readonly _context: ExtractorContext;
  private readonly _tsdocParser: tsdoc.TSDocParser;
  private readonly _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;
  private readonly _cachedOverloadIndexesByDeclaration: Map<AstDeclaration, number>;
  private readonly _apiModel: ApiModel;

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._tsdocParser = new tsdoc.TSDocParser(AedocDefinitions.parserConfiguration);
    this._astSymbolTable = new AstSymbolTable(this._context.typeChecker, this._context.packageJsonLookup);
    this._cachedOverloadIndexesByDeclaration = new Map<AstDeclaration, number>();
    this._apiModel = new ApiModel();
  }

  public process(): void {
    const docComment: tsdoc.DocComment | undefined = this._tryParsePackageDocumentation(
      this._context.entryPointSourceFile);

    const apiPackage: ApiPackage = new ApiPackage({
      name: this._context.packageName,
      docComment: docComment
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

    apiPackage.saveToJsonFile('c:\\GitRepos\\serialize.json');

    const test: ApiModel = new ApiModel();
    const testPackage: ApiPackage = test.loadPackage('c:\\GitRepos\\serialize.json');
    testPackage.saveToJsonFile('c:\\GitRepos\\serialize2.json');

    debugger;
  }

  public _processDeclaration(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

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

      case ts.SyntaxKind.ModuleDeclaration:
        this._processApiNamespace(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.PropertySignature:
        this._processApiPropertySignature(astDeclaration, exportedName, parentApiItem);
        break;

      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
      default:
    }
  }

  private _processChildDeclarations(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {
    for (const childDeclaration of astDeclaration.children) {
      this._processDeclaration(childDeclaration, undefined, parentApiItem);
    }
  }

  private _processApiClass(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiClass.getCanonicalReference(name);

    let apiClass: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiClass;

    if (apiClass === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation);  // FirstPunctuation = "{"
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);

      apiClass = new ApiClass({ name, signature, docComment });
      parentApiItem.addMember(apiClass);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiClass);
  }

  private _processApiInterface(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiInterface.getCanonicalReference(name);

    let apiInterface: ApiClass | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiInterface;

    if (apiInterface === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.FirstPunctuation); // FirstPunctuation = "{"
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);

      apiInterface = new ApiInterface({ name, signature, docComment });
      parentApiItem.addMember(apiInterface);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiInterface);
  }

  private _processApiMethod(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

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

      apiMethod = new ApiMethod({ name, signature, docComment, isStatic, overloadIndex });

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

  private _processApiNamespace(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiNamespace.getCanonicalReference(name);

    let apiNamespace: ApiNamespace | undefined = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiNamespace === undefined) {
      const signature: string = this._getSignatureBeforeNodeKind(astDeclaration.declaration,
        ts.SyntaxKind.ModuleBlock); // ModuleBlock = the "{ ... }" block
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);

      apiNamespace = new ApiNamespace({ name, signature, docComment });
      parentApiItem.addMember(apiNamespace);
    }

    this._processChildDeclarations(astDeclaration, exportedName, apiNamespace);
  }

  private _processApiPropertySignature(astDeclaration: AstDeclaration, exportedName: string | undefined,
    parentApiItem: IApiItemContainer): void {

    const name: string = !!exportedName ? exportedName : astDeclaration.astSymbol.localName;
    const canonicalReference: string = ApiPropertySignature.getCanonicalReference(name);

    let apiPropertySignature: ApiPropertySignature | undefined
      = parentApiItem.tryGetMember(canonicalReference) as ApiNamespace;

    if (apiPropertySignature === undefined) {
      const signature: string = astDeclaration.declaration.getText();
      const docComment: tsdoc.DocComment | undefined = this._tryParseDocumentation(astDeclaration);

      apiPropertySignature = new ApiPropertySignature({ name, signature, docComment });
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

  private _tryParsePackageDocumentation(sourceFile: ts.SourceFile): tsdoc.DocComment | undefined {
    // The @packageDocumentation comment is special because it is not attached to an AST
    // definition.  Instead, it is part of the "trivia" tokens that the compiler treats
    // as irrelevant white space.
    //
    // WARNING: If the comment doesn't precede an export statement, the compiler will omit
    // it from the *.d.ts file, and API Extractor won't find it.  If this happens, you need
    // to rearrange your statements to ensure it is passed through.
    //
    // This implementation assumes that the "@packageDocumentation" will be in the first TSDoc comment
    // that appears in the entry point *.d.ts file.  We could possibly look in other places,
    // but the above warning suggests enforcing a standardized layout.  This design choice is open
    // to feedback.
    let packageCommentRange: ts.TextRange | undefined = undefined; // empty string

    for (const commentRange of ts.getLeadingCommentRanges(sourceFile.text, sourceFile.getFullStart()) || []) {
      if (commentRange.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        const commentBody: string = sourceFile.text.substring(commentRange.pos, commentRange.end);

        // Choose the first JSDoc-style comment
        if (/^\s*\/\*\*/.test(commentBody)) {
          // But only if it looks like it's trying to be @packageDocumentation
          // (The TSDoc parser will validate this more rigorously)
          if (/\@packageDocumentation/i.test(commentBody)) {
            packageCommentRange = commentRange;
          }
          break;
        }
      }
    }

    if (!packageCommentRange) {
      // If we didn't find the @packageDocumentation tag in the expected place, is it in some
      // wrong place?  This sanity check helps people to figure out why there comment isn't working.
      for (const statement of sourceFile.statements) {
        const ranges: ts.CommentRange[] = [];
        ranges.push(...ts.getLeadingCommentRanges(sourceFile.text, statement.getFullStart()) || []);
        ranges.push(...ts.getTrailingCommentRanges(sourceFile.text, statement.getEnd()) || []);

        for (const commentRange of ranges) {
          const commentBody: string = sourceFile.text.substring(commentRange.pos, commentRange.end);

          if (/\@packageDocumentation/i.test(commentBody)) {
            this._context.reportError(
              'The @packageDocumentation comment must appear at the top of entry point *.d.ts file',
              sourceFile, commentRange.pos
            );
            break;
          }
        }
      }
    }

    if (packageCommentRange === undefined) {
      return undefined;
    }

    return this._parseTsdocComment(sourceFile.text, packageCommentRange);
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
