// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as path from 'path';
import * as tsdoc from '@microsoft/tsdoc';
import {
  PackageJsonLookup,
  IPackageJson,
  Sort,
  InternalError
} from '@microsoft/node-core-library';

import { ILogger } from '../api/ILogger';
import {
  IExtractorPoliciesConfig,
  IExtractorValidationRulesConfig,
  ExtractorValidationRulePolicy
} from '../api/IExtractorConfig';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';
import { CollectorEntity } from './CollectorEntity';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstModule } from '../analyzer/AstModule';
import { AstSymbol } from '../analyzer/AstSymbol';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { CollectorPackage } from './CollectorPackage';
import { PackageDocComment } from '../aedoc/PackageDocComment';
import { DeclarationMetadata } from './DeclarationMetadata';
import { SymbolMetadata } from './SymbolMetadata';

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
  public readonly program: ts.Program;
  public readonly typeChecker: ts.TypeChecker;
  public readonly astSymbolTable: AstSymbolTable;

  public readonly packageJsonLookup: PackageJsonLookup;

  public readonly policies: IExtractorPoliciesConfig;
  public readonly validationRules: IExtractorValidationRulesConfig;

  public readonly logger: ILogger;

  public readonly package: CollectorPackage;

  private readonly _program: ts.Program;

  private readonly _tsdocParser: tsdoc.TSDocParser;

  private _astEntryPoint: AstModule | undefined;

  private readonly _entities: CollectorEntity[] = [];
  private readonly _entitiesByAstSymbol: Map<AstSymbol, CollectorEntity> = new Map<AstSymbol, CollectorEntity>();
  private readonly _entitiesBySymbol: Map<ts.Symbol, CollectorEntity> = new Map<ts.Symbol, CollectorEntity>();

  private readonly _starExportedExternalModulePaths: string[] = [];

  private readonly _dtsTypeReferenceDirectives: Set<string> = new Set<string>();
  private readonly _dtsLibReferenceDirectives: Set<string> = new Set<string>();

  constructor(options: ICollectorOptions) {
    this.packageJsonLookup = new PackageJsonLookup();

    this.policies = options.policies;
    this.validationRules = options.validationRules;

    this.logger = options.logger;
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

    this.program = options.program;
    this.typeChecker = options.program.getTypeChecker();

    this._tsdocParser = new tsdoc.TSDocParser();
    this.astSymbolTable = new AstSymbolTable(this.program, this.typeChecker, this.packageJsonLookup, this.logger);
  }

  /**
   * Returns a list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * ```
   * /// <reference types="example-library" />
   * ```
   */
  public get dtsTypeReferenceDirectives(): ReadonlySet<string> {
    return this._dtsTypeReferenceDirectives;
  }

  /**
   * A list of names (e.g. "runtime-library") that should appear in a reference like this:
   *
   * ```
   * /// <reference lib="runtime-library" />
   * ```
   */
  public get dtsLibReferenceDirectives(): ReadonlySet<string> {
    return this._dtsLibReferenceDirectives;
  }

  public get entities(): ReadonlyArray<CollectorEntity> {
    return this._entities;
  }

  /**
   * A list of module specifiers (e.g. `"@microsoft/node-core-library/lib/FileSystem"`) that should be emitted
   * as star exports (e.g. `export * from "@microsoft/node-core-library/lib/FileSystem"`).
   */
  public get starExportedExternalModulePaths(): ReadonlyArray<string> {
    return this._starExportedExternalModulePaths;
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
    const astEntryPoint: AstModule = this.astSymbolTable.fetchEntryPointModule(
      this.package.entryPointSourceFile);
    this._astEntryPoint = astEntryPoint;

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment.tryFindInSourceFile(
      this.package.entryPointSourceFile, this);

    if (packageDocCommentTextRange) {
      const range: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(this.package.entryPointSourceFile.text,
        packageDocCommentTextRange.pos, packageDocCommentTextRange.end);

      this.package.tsdocParserContext = this._tsdocParser.parseRange(range);
      this.package.tsdocComment = this.package.tsdocParserContext!.docComment;
    }

    const exportedAstSymbols: AstSymbol[] = [];

    // Create a CollectorEntity for each top-level export
    for (const [exportName, astSymbol] of astEntryPoint.exportedSymbols) {
      this._createEntityForSymbol(astSymbol, exportName);

      exportedAstSymbols.push(astSymbol);
    }

    // Create a CollectorEntity for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstSymbols: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstSymbol of exportedAstSymbols) {
      this._createEntityForIndirectReferences(exportedAstSymbol, alreadySeenAstSymbols);

      this.fetchMetadata(exportedAstSymbol);
    }

    this._makeUniqueNames();

    for (const starExportedExternalModule of astEntryPoint.starExportedExternalModules) {
      if (starExportedExternalModule.externalModulePath !== undefined) {
        this._starExportedExternalModulePaths.push(starExportedExternalModule.externalModulePath);
      }
    }

    Sort.sortBy(this._entities, x => x.getSortKey());
    Sort.sortSet(this._dtsTypeReferenceDirectives);
    Sort.sortSet(this._dtsLibReferenceDirectives);
    this._starExportedExternalModulePaths.sort();
  }

  public tryGetEntityBySymbol(symbol: ts.Symbol): CollectorEntity | undefined {
    return this._entitiesBySymbol.get(symbol);
  }

  public fetchMetadata(astSymbol: AstSymbol): SymbolMetadata;
  public fetchMetadata(astDeclaration: AstDeclaration): DeclarationMetadata;
  public fetchMetadata(symbolOrDeclaration: AstSymbol | AstDeclaration): SymbolMetadata | DeclarationMetadata {
    if (symbolOrDeclaration.metadata === undefined) {
      const astSymbol: AstSymbol = symbolOrDeclaration instanceof AstSymbol
        ? symbolOrDeclaration : symbolOrDeclaration.astSymbol;
      this._fetchSymbolMetadata(astSymbol);
    }
    return symbolOrDeclaration.metadata as SymbolMetadata | DeclarationMetadata;
  }

  /**
   * Removes the leading underscore, for example: "_Example" --> "example*Example*_"
   *
   * @remarks
   * This causes internal definitions to sort alphabetically case-insensitive, then case-sensitive, and
   * initially ignoring the underscore prefix, while still deterministically comparing it.
   * The star is used as a delimiter because it is not a legal  identifier character.
   */
  public static getSortKeyIgnoringUnderscore(identifier: string): string {
    let parts: string[];

    if (identifier[0] === '_') {
      const withoutUnderscore: string = identifier.substr(1);
      parts = [withoutUnderscore.toLowerCase(), '*', withoutUnderscore, '*', '_'];
    } else {
      parts = [identifier.toLowerCase(), '*', identifier];
    }

    return parts.join('');
  }

  private _createEntityForSymbol(astSymbol: AstSymbol, exportedName: string | undefined): void {
    let entity: CollectorEntity | undefined = this._entitiesByAstSymbol.get(astSymbol);

    if (!entity) {
      entity = new CollectorEntity(astSymbol);

      this._entitiesByAstSymbol.set(astSymbol, entity);
      this._entitiesBySymbol.set(astSymbol.followedSymbol, entity);
      this._entities.push(entity);

      this._collectReferenceDirectives(astSymbol);
    }

    if (exportedName) {
      entity.addExportName(exportedName);
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

    // First collect the explicit package exports (named)
    for (const entity of this._entities) {
      for (const exportName of entity.exportNames) {
        if (usedNames.has(exportName)) {
          // This should be impossible
          throw new InternalError(`A package cannot have two exports with the name "${exportName}"`);
        }

        usedNames.add(exportName);
      }
    }

    // Next generate unique names for the non-exports that will be emitted (and the default export)
    for (const entity of this._entities) {

      // If this entity is exported exactly once, then emit the exported name
      if (entity.singleExportName !== undefined && entity.singleExportName !== ts.InternalSymbolName.Default) {
        entity.nameForEmit = entity.singleExportName;
        continue;
      }

      // If the localName happens to be the same as one of the exports, then emit that name
      if (entity.exportNames.has(entity.astSymbol.localName)) {
        entity.nameForEmit = entity.astSymbol.localName;
        continue;
      }

      // In all other cases, generate a unique name based on the localName
      let suffix: number = 1;
      let nameForEmit: string = entity.astSymbol.localName;
      while (usedNames.has(nameForEmit)) {
        nameForEmit = `${entity.astSymbol.localName}_${++suffix}`;
      }
      entity.nameForEmit = nameForEmit;
      usedNames.add(nameForEmit);
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
      this.logger.logError(`${shownPath}(${lineAndCharacter.line + 1},${lineAndCharacter.character + 1}): `
        + message);
    } else {
      this.logger.logError(message);
    }
  }

  private _fetchSymbolMetadata(astSymbol: AstSymbol): void {
    if (astSymbol.metadata) {
      return;
    }

    // When we solve an astSymbol, then we always also solve all of its parents and all of its declarations
    if (astSymbol.parentAstSymbol && astSymbol.parentAstSymbol.metadata === undefined) {
      this._fetchSymbolMetadata(astSymbol.parentAstSymbol);
    }

    for (const astDeclaration of astSymbol.astDeclarations) {
      this._calculateMetadataForDeclaration(astDeclaration);
    }

    // We know we solved parentAstSymbol.metadata above
    const parentSymbolMetadata: SymbolMetadata | undefined = astSymbol.parentAstSymbol
      ? astSymbol.parentAstSymbol.metadata as SymbolMetadata : undefined;

    const symbolMetadata: SymbolMetadata = new SymbolMetadata();

    // Do any of the declarations have a release tag?
    let effectiveReleaseTag: ReleaseTag = ReleaseTag.None;

    for (const astDeclaration of astSymbol.astDeclarations) {
      // We know we solved this above
      const declarationMetadata: DeclarationMetadata = astDeclaration.metadata as DeclarationMetadata;

      const declaredReleaseTag: ReleaseTag = declarationMetadata.declaredReleaseTag;

      if (declaredReleaseTag !== ReleaseTag.None) {
        if (effectiveReleaseTag !== ReleaseTag.None && effectiveReleaseTag !== declaredReleaseTag) {
          if (!astSymbol.rootAstSymbol.imported) { // for now, don't report errors for external code
            // TODO: Report error message
            this.reportError('Inconsistent release tags between declarations', undefined, undefined);
          }
        } else {
          effectiveReleaseTag = declaredReleaseTag;
        }
      }
    }

    // If this declaration doesn't have a release tag, then inherit it from the parent
    if (effectiveReleaseTag === ReleaseTag.None && astSymbol.parentAstSymbol) {
      if (parentSymbolMetadata) {
        effectiveReleaseTag = parentSymbolMetadata.releaseTag;
      }
    }

    if (effectiveReleaseTag === ReleaseTag.None) {
      if (this.validationRules.missingReleaseTags !== ExtractorValidationRulePolicy.allow) {
        if (!astSymbol.rootAstSymbol.imported) { // for now, don't report errors for external code
          // For now, don't report errors for forgotten exports
          const entity: CollectorEntity | undefined = this._entitiesByAstSymbol.get(astSymbol.rootAstSymbol);
          if (entity && entity.exported) {
            // We also don't report errors for the default export of an entry point, since its doc comment
            // isn't easy to obtain from the .d.ts file
            if (astSymbol.rootAstSymbol.localName !== '_default') {
              // TODO: Report error message
              const loc: string = astSymbol.rootAstSymbol.localName + ' in '
                + astSymbol.rootAstSymbol.astDeclarations[0].declaration.getSourceFile().fileName;
              this.reportError('Missing release tag for ' + loc, undefined, undefined);
            }
          }
        }
      }

      effectiveReleaseTag = ReleaseTag.Public;
    }

    symbolMetadata.releaseTag = effectiveReleaseTag;
    symbolMetadata.releaseTagSameAsParent = false;
    if (parentSymbolMetadata) {
      symbolMetadata.releaseTagSameAsParent = symbolMetadata.releaseTag === parentSymbolMetadata.releaseTag;
    }

    // Update this last when we're sure no exceptions were thrown
    astSymbol.metadata = symbolMetadata;
  }

  private _calculateMetadataForDeclaration(astDeclaration: AstDeclaration): void {
    const declarationMetadata: DeclarationMetadata = new DeclarationMetadata();
    astDeclaration.metadata = declarationMetadata;

    const parserContext: tsdoc.ParserContext | undefined = this._parseTsdocForAstDeclaration(astDeclaration);
    if (parserContext) {
      const modifierTagSet: tsdoc.StandardModifierTagSet = parserContext.docComment.modifierTagSet;

      let declaredReleaseTag: ReleaseTag = ReleaseTag.None;
      let inconsistentReleaseTags: boolean = false;

      if (modifierTagSet.isPublic()) {
        declaredReleaseTag = ReleaseTag.Public;
      }
      if (modifierTagSet.isBeta()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Beta;
        }
      }
      if (modifierTagSet.isAlpha()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Alpha;
        }
      }
      if (modifierTagSet.isInternal()) {
        if (declaredReleaseTag !== ReleaseTag.None) {
          inconsistentReleaseTags = true;
        } else {
          declaredReleaseTag = ReleaseTag.Internal;
        }
      }

      if (inconsistentReleaseTags) {
        if (!astDeclaration.astSymbol.rootAstSymbol.imported) { // for now, don't report errors for external code
          // TODO: Report error message
          this.reportError('Inconsistent release tags in doc comment', undefined, undefined);
        }
      }

      declarationMetadata.tsdocParserContext = parserContext;
      declarationMetadata.tsdocComment = parserContext.docComment;

      declarationMetadata.declaredReleaseTag = declaredReleaseTag;

      declarationMetadata.isEventProperty = modifierTagSet.isEventProperty();
      declarationMetadata.isOverride = modifierTagSet.isOverride();
      declarationMetadata.isSealed = modifierTagSet.isSealed();
      declarationMetadata.isVirtual = modifierTagSet.isVirtual();

      // Require the summary to contain at least 10 non-spacing characters
      declarationMetadata.needsDocumentation = !tsdoc.PlainTextEmitter.hasAnyTextContent(
        parserContext.docComment.summarySection, 10);
    }
  }

  private _parseTsdocForAstDeclaration(astDeclaration: AstDeclaration): tsdoc.ParserContext | undefined {
    const declaration: ts.Declaration = astDeclaration.declaration;
    let nodeForComment: ts.Node = declaration;

    if (ts.isVariableDeclaration(declaration)) {
      // Variable declarations are special because they can be combined into a list.  For example:
      //
      // /** A */ export /** B */ const /** C */ x = 1, /** D **/ [ /** E */ y, z] = [3, 4];
      //
      // The compiler will only emit comments A and C in the .d.ts file, so in general there isn't a well-defined
      // way to document these parts.  API Extractor requires you to break them into separate exports like this:
      //
      // /** A */ export const x = 1;
      //
      // But _getReleaseTagForDeclaration() still receives a node corresponding to "x", so we need to walk upwards
      // and find the containing statement in order for getJSDocCommentRanges() to read the comment that we expect.
      const statement: ts.VariableStatement | undefined = TypeScriptHelpers.findFirstParent(declaration,
        ts.SyntaxKind.VariableStatement) as ts.VariableStatement | undefined;
      if (statement !== undefined) {
        // For a compound declaration, fall back to looking for C instead of A
        if (statement.declarationList.declarations.length === 1) {
          nodeForComment = statement;
        }
      }
    }

    const sourceFileText: string = declaration.getSourceFile().text;
    const ranges: ts.CommentRange[] = TypeScriptHelpers.getJSDocCommentRanges(nodeForComment, sourceFileText) || [];

    if (ranges.length === 0) {
      return undefined;
    }

    // We use the JSDoc comment block that is closest to the definition, i.e.
    // the last one preceding it
    const range: ts.TextRange = ranges[ranges.length - 1];

    const tsdocTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(sourceFileText,
      range.pos, range.end);

    return this._tsdocParser.parseRange(tsdocTextRange);
  }

  private _collectReferenceDirectives(astSymbol: AstSymbol): void {
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
            this._dtsTypeReferenceDirectives.add(name);
          }

          for (const libReferenceDirective of sourceFile.libReferenceDirectives) {
            const name: string = sourceFile.text.substring(libReferenceDirective.pos, libReferenceDirective.end);
            this._dtsLibReferenceDirectives.add(name);
          }

        }
      }
    }
  }
}
