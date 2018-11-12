// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as path from 'path';
import * as tsdoc from '@microsoft/tsdoc';
import {
  PackageJsonLookup,
  IPackageJson,
  Sort
} from '@microsoft/node-core-library';

import { ILogger } from '../api/ILogger';
import { IExtractorPoliciesConfig, IExtractorValidationRulesConfig } from '../api/IExtractorConfig';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';
import { CollectorEntity } from './CollectorEntity';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntryPoint } from '../analyzer/AstEntryPoint';
import { AstSymbol } from '../analyzer/AstSymbol';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { CollectorPackage } from './CollectorPackage';
import { PackageDocComment } from '../aedoc/PackageDocComment';

/**
 * Options for Collector constructor.
 */
export interface ICollectorOptions {
  /**
   * Configuration for the TypeScript compiler.  The most important options to set are:
   *
   * - target: ts.ScriptTarget.ES5
   * - module: ts.ModuleKind.CommonJS
   * - moduleResolution: ts.ModuleResolutionKind.NodeJs
   * - rootDir: inputFolder
   */
  program: ts.Program;

  /**
   * The entry point for the project.  This should correspond to the "main" field
   * from NPM's package.json file.  If it is a relative path, it will be relative to
   * the project folder described by IExtractorAnalyzeOptions.compilerOptions.
   */
  entryPointFile: string;

  logger: ILogger;

  policies: IExtractorPoliciesConfig;

  validationRules: IExtractorValidationRulesConfig;
}

/**
 * The main entry point for the "api-extractor" utility.  The Analyzer object invokes the
 * TypeScript Compiler API to analyze a project, and constructs the AstItem
 * abstract syntax tree.
 */
export class Collector {
  public typeChecker: ts.TypeChecker;
  public astSymbolTable: AstSymbolTable;

  public readonly packageJsonLookup: PackageJsonLookup;

  public readonly policies: IExtractorPoliciesConfig;
  public readonly validationRules: IExtractorValidationRulesConfig;

  private readonly _program: ts.Program;

  public readonly package: CollectorPackage;

  private readonly _logger: ILogger;

  private readonly _tsdocParser: tsdoc.TSDocParser;

  private _astEntryPoint: AstEntryPoint | undefined;

  private readonly _entities: CollectorEntity[] = [];
  private readonly _entitiesByAstSymbol: Map<AstSymbol, CollectorEntity> = new Map<AstSymbol, CollectorEntity>();
  private readonly _entitiesBySymbol: Map<ts.Symbol, CollectorEntity> = new Map<ts.Symbol, CollectorEntity>();
  private readonly _releaseTagByAstSymbol: Map<AstSymbol, ReleaseTag> = new Map<AstSymbol, ReleaseTag>();

  private readonly _dtsTypeDefinitionReferences: string[] = [];

  constructor(options: ICollectorOptions) {
    this.packageJsonLookup = new PackageJsonLookup();

    this.policies = options.policies;
    this.validationRules = options.validationRules;

    this._logger = options.logger;
    this._program = options.program;

    const packageFolder: string | undefined = this.packageJsonLookup.tryGetPackageFolderFor(options.entryPointFile);
    if (!packageFolder) {
      throw new Error('Unable to find a package.json for entry point: ' + options.entryPointFile);
    }

    const packageJson: IPackageJson = this.packageJsonLookup.tryLoadPackageJsonFor(packageFolder)!;

    const entryPointSourceFile: ts.SourceFile | undefined = options.program.getSourceFile(options.entryPointFile);
    if (!entryPointSourceFile) {
      throw new Error('Unable to load file: ' + options.entryPointFile);
    }

    this.package = new CollectorPackage({
      packageFolder,
      packageJson,
      entryPointSourceFile
    });

    this.typeChecker = options.program.getTypeChecker();

    this._tsdocParser = new tsdoc.TSDocParser();
    this.astSymbolTable = new AstSymbolTable(this.typeChecker, this.packageJsonLookup);
  }

  /**
   * Returns a list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * /// <reference types="example-library" />
   */
  public get dtsTypeDefinitionReferences(): ReadonlyArray<string> {
    return this._dtsTypeDefinitionReferences;
  }

  public get entities(): ReadonlyArray<CollectorEntity> {
    return this._entities;
  }

  /**
   * Perform the analysis.
   */
  public analyze(): void {
    if (this._astEntryPoint) {
      throw new Error('DtsRollupGenerator.analyze() was already called');
    }

    // This runs a full type analysis, and then augments the Abstract Syntax Tree (i.e. declarations)
    // with semantic information (i.e. symbols).  The "diagnostics" are a subset of the everyday
    // compile errors that would result from a full compilation.
    for (const diagnostic of this._program.getSemanticDiagnostics()) {
      const errorText: string = TypeScriptMessageFormatter.format(diagnostic.messageText);
      this.reportError(`TypeScript: ${errorText}`, diagnostic.file, diagnostic.start);
    }

    // Build the entry point
    const astEntryPoint: AstEntryPoint = this.astSymbolTable.fetchEntryPoint(this.package.entryPointSourceFile);

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment.tryFindInSourceFile(
      this.package.entryPointSourceFile, this);

    if (packageDocCommentTextRange) {
      const range: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(this.package.entryPointSourceFile.text,
        packageDocCommentTextRange.pos, packageDocCommentTextRange.end);

      this.package.tsdocComment = this._tsdocParser.parseRange(range).docComment;
    }

    const exportedAstSymbols: AstSymbol[] = [];

    // Create a CollectorEntity for each top-level export
    for (const exportedMember of astEntryPoint.exportedMembers) {
      const astSymbol: AstSymbol = exportedMember.astSymbol;

      this._createEntityForSymbol(exportedMember.astSymbol, exportedMember.name);

      exportedAstSymbols.push(astSymbol);
    }

    // Create a CollectorEntity for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstSymbols: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstSymbol of exportedAstSymbols) {
      this._createEntityForIndirectReferences(exportedAstSymbol, alreadySeenAstSymbols);
    }

    this._makeUniqueNames();

    Sort.sortBy(this._entities, x => x.getSortKey());
    this._dtsTypeDefinitionReferences.sort();
  }

  public getTsdocCommentForAstDeclaration(astDeclaration: AstDeclaration): tsdoc.DocComment | undefined {
    const declaration: ts.Declaration = astDeclaration.declaration;
    const sourceFileText: string = declaration.getSourceFile().text;
    const ranges: ts.CommentRange[] = TypeScriptHelpers.getJSDocCommentRanges(declaration, sourceFileText) || [];

    if (ranges.length === 0) {
      return undefined;
    }

    // We use the JSDoc comment block that is closest to the definition, i.e.
    // the last one preceding it
    const range: ts.TextRange = ranges[ranges.length - 1];

    const tsdocTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(sourceFileText,
      range.pos, range.end);

    const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(tsdocTextRange);
    return parserContext.docComment;
  }

  public tryGetEntityBySymbol(symbol: ts.Symbol): CollectorEntity | undefined {
    return this._entitiesBySymbol.get(symbol);
  }

  private _createEntityForSymbol(astSymbol: AstSymbol, exportedName: string | undefined): void {
    let entity: CollectorEntity | undefined = this._entitiesByAstSymbol.get(astSymbol);

    if (!entity) {
      entity = new CollectorEntity({
        astSymbol: astSymbol,
        originalName: exportedName || astSymbol.localName,
        exported: !!exportedName
      });

      this._entitiesByAstSymbol.set(astSymbol, entity);
      this._entitiesBySymbol.set(astSymbol.followedSymbol, entity);
      this._entities.push(entity);

      this._collectTypeDefinitionReferences(astSymbol);
    } else {
      if (exportedName) {
        if (!entity.exported) {
          throw new Error('Program Bug: CollectorEntity should have been marked as exported');
        }
        if (entity.originalName !== exportedName) {
          throw new Error(`The symbol ${exportedName} was also exported as ${entity.originalName};`
            + ` this is not supported yet`);
        }
      }
    }
  }

  private _createEntityForIndirectReferences(astSymbol: AstSymbol, alreadySeenAstSymbols: Set<AstSymbol>): void {
    if (alreadySeenAstSymbols.has(astSymbol)) {
      return;
    }
    alreadySeenAstSymbols.add(astSymbol);

    astSymbol.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
      for (const referencedAstSymbol of astDeclaration.referencedAstSymbols) {
        this._createEntityForSymbol(referencedAstSymbol, undefined);
        this._createEntityForIndirectReferences(referencedAstSymbol, alreadySeenAstSymbols);
      }
    });
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();

    // First collect the explicit package exports
    for (const entity of this._entities) {
      if (entity.exported) {

        if (usedNames.has(entity.originalName)) {
          // This should be impossible
          throw new Error(`Program bug: a package cannot have two exports with the name ${entity.originalName}`);
        }

        entity.nameForEmit = entity.originalName;

        usedNames.add(entity.nameForEmit);
      }
    }

    // Next generate unique names for the non-exports that will be emitted
    for (const entity of this._entities) {
      if (!entity.exported) {
        let suffix: number = 1;
        entity.nameForEmit = entity.originalName;

        while (usedNames.has(entity.nameForEmit)) {
          entity.nameForEmit = `${entity.originalName}_${++suffix}`;
        }

        usedNames.add(entity.nameForEmit);
      }
    }
  }

  /**
   * Reports an error message to the registered ApiErrorHandler.
   */
  public reportError(message: string, sourceFile: ts.SourceFile | undefined, start: number | undefined): void {
    if (sourceFile && start) {
      const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(start);

      // If the file is under the packageFolder, then show a relative path
      const relativePath: string = path.relative(this.package.packageFolder, sourceFile.fileName);
      const shownPath: string = relativePath.substr(0, 2) === '..' ? sourceFile.fileName : relativePath;

      // Format the error so that VS Code can follow it.  For example:
      // "src\MyClass.ts(15,1): The JSDoc tag "@blah" is not supported by AEDoc"
      this._logger.logError(`${shownPath}(${lineAndCharacter.line + 1},${lineAndCharacter.character + 1}): `
        + message);
    } else {
      this._logger.logError(message);
    }
  }

  public getReleaseTagForAstSymbol(astSymbol: AstSymbol): ReleaseTag {
    let releaseTag: ReleaseTag | undefined = this._releaseTagByAstSymbol.get(astSymbol);
    if (releaseTag) {
      return releaseTag;
    }

    releaseTag = ReleaseTag.None;

    let current: AstSymbol | undefined = astSymbol;
    while (current) {
      for (const astDeclaration of current.astDeclarations) {
        const declarationReleaseTag: ReleaseTag = this._getReleaseTagForDeclaration(astDeclaration.declaration);
        if (releaseTag !== ReleaseTag.None && declarationReleaseTag !== releaseTag) {
          // this._analyzeWarnings.push('WARNING: Conflicting release tags found for ' + symbol.name);
          break;
        }

        releaseTag = declarationReleaseTag;
      }

      if (releaseTag !== ReleaseTag.None) {
        break;
      }

      current = current.parentAstSymbol;
    }

    if (releaseTag === ReleaseTag.None) {
      releaseTag = ReleaseTag.Public; // public by default
    }

    this._releaseTagByAstSymbol.set(astSymbol, releaseTag);

    return releaseTag;
  }

  // NOTE: THIS IS A TEMPORARY WORKAROUND.
  // In the near future we will overhaul the AEDoc parser to separate syntactic/semantic analysis,
  // at which point this will be wired up to the same ApiDocumentation layer used for the API Review files
  private _getReleaseTagForDeclaration(declaration: ts.Node): ReleaseTag {
    const sourceFileText: string = declaration.getSourceFile().text;

    for (const commentRange of TypeScriptHelpers.getJSDocCommentRanges(declaration, sourceFileText) || []) {
      // NOTE: This string includes "/**"
      const commentTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(
        sourceFileText, commentRange.pos, commentRange.end);

      const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(commentTextRange);
      const modifierTagSet: tsdoc.StandardModifierTagSet = parserContext.docComment.modifierTagSet;

      if (modifierTagSet.isPublic()) {
        return ReleaseTag.Public;
      }
      if (modifierTagSet.isBeta()) {
        return ReleaseTag.Beta;
      }
      if (modifierTagSet.isAlpha()) {
        return ReleaseTag.Alpha;
      }
      if (modifierTagSet.isInternal()) {
        return ReleaseTag.Internal;
      }
    }

    return ReleaseTag.None;
  }

  private _collectTypeDefinitionReferences(astSymbol: AstSymbol): void {
    // Are we emitting declarations?
    if (astSymbol.astImport) {
      return; // no, it's an import
    }

    const seenFilenames: Set<string> = new Set<string>();

    for (const astDeclaration of astSymbol.astDeclarations) {
      const sourceFile: ts.SourceFile = astDeclaration.declaration.getSourceFile();
      if (sourceFile && sourceFile.fileName) {
        if (!seenFilenames.has(sourceFile.fileName)) {
          seenFilenames.add(sourceFile.fileName);

          for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
            const name: string = sourceFile.text.substring(typeReferenceDirective.pos, typeReferenceDirective.end);
            if (this._dtsTypeDefinitionReferences.indexOf(name) < 0) {
              this._dtsTypeDefinitionReferences.push(name);
            }
          }

        }
      }
    }
  }
}
