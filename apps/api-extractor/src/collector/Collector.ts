// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
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
import { ExtractorMessageId } from '../api/ExtractorMessageId';

import { CollectorEntity } from './CollectorEntity';
import { AstSymbolTable, AstEntity } from '../analyzer/AstSymbolTable';
import { AstModule, AstModuleExportInfo } from '../analyzer/AstModule';
import { AstSymbol } from '../analyzer/AstSymbol';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { WorkingPackage } from './WorkingPackage';
import { PackageDocComment } from '../aedoc/PackageDocComment';
import { DeclarationMetadata } from './DeclarationMetadata';
import { SymbolMetadata } from './SymbolMetadata';
import { TypeScriptInternals } from '../analyzer/TypeScriptInternals';
import { MessageRouter } from './MessageRouter';

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
   * The entry point to be processed by API Extractor.  Normally this should correspond to
   * the "main" field from the package.json file.  If it is a relative path, it will be
   * relative to the project folder described by IExtractorAnalyzeOptions.compilerOptions.
   */
  entryPointFile: string;

  logger: ILogger;

  policies: IExtractorPoliciesConfig;

  validationRules: IExtractorValidationRulesConfig;
}

/**
 * The `Collector` manages the overall data set that is used by `ApiModelGenerator`,
 * `DtsRollupGenerator`, and `ReviewFileGenerator`.  Starting from the working package's entry point,
 * the `Collector` collects all exported symbols, determines how to import any symbols they reference,
 * assigns unique names, and sorts everything into a normalized alphabetical ordering.
 */
export class Collector {
  public readonly program: ts.Program;
  public readonly typeChecker: ts.TypeChecker;
  public readonly astSymbolTable: AstSymbolTable;

  public readonly packageJsonLookup: PackageJsonLookup;
  public readonly messageRouter: MessageRouter;

  public readonly policies: IExtractorPoliciesConfig;
  public readonly validationRules: IExtractorValidationRulesConfig;

  public readonly logger: ILogger;

  public readonly workingPackage: WorkingPackage;

  private readonly _program: ts.Program;

  private readonly _tsdocParser: tsdoc.TSDocParser;

  private _astEntryPoint: AstModule | undefined;

  private readonly _entities: CollectorEntity[] = [];
  private readonly _entitiesByAstEntity: Map<AstEntity, CollectorEntity> = new Map<AstEntity, CollectorEntity>();

  private readonly _starExportedExternalModulePaths: string[] = [];

  private readonly _dtsTypeReferenceDirectives: Set<string> = new Set<string>();
  private readonly _dtsLibReferenceDirectives: Set<string> = new Set<string>();

  constructor(options: ICollectorOptions) {
    this.packageJsonLookup = new PackageJsonLookup();
    this.messageRouter = new MessageRouter();

    this.policies = options.policies;
    this.validationRules = options.validationRules;

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

    this.workingPackage = new WorkingPackage({
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
      this.messageRouter.addCompilerDiagnostic(diagnostic);
    }

    // Build the entry point
    const entryPointSourceFile: ts.SourceFile = this.workingPackage.entryPointSourceFile;

    const astEntryPoint: AstModule = this.astSymbolTable.fetchAstModuleFromWorkingPackage(
      entryPointSourceFile);
    this._astEntryPoint = astEntryPoint;

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment.tryFindInSourceFile(
      entryPointSourceFile, this);

    if (packageDocCommentTextRange) {
      const range: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(entryPointSourceFile.text,
        packageDocCommentTextRange.pos, packageDocCommentTextRange.end);

      this.workingPackage.tsdocParserContext = this._tsdocParser.parseRange(range);

      this.messageRouter.addTsdocMessages(this.workingPackage.tsdocParserContext,
        entryPointSourceFile);

      this.workingPackage.tsdocComment = this.workingPackage.tsdocParserContext!.docComment;
    }

    const exportedAstEntities: AstEntity[] = [];

    // Create a CollectorEntity for each top-level export

    const astModuleExportInfo: AstModuleExportInfo = this.astSymbolTable.fetchAstModuleExportInfo(astEntryPoint);
    for (const [exportName, astEntity] of astModuleExportInfo.exportedLocalEntities) {
      this._createCollectorEntity(astEntity, exportName);

      exportedAstEntities.push(astEntity);
    }

    // Create a CollectorEntity for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstSymbols: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstEntity of exportedAstEntities) {
      this._createEntityForIndirectReferences(exportedAstEntity, alreadySeenAstSymbols);

      if (exportedAstEntity instanceof AstSymbol) {
        this.fetchMetadata(exportedAstEntity);
      }
    }

    this._makeUniqueNames();

    for (const starExportedExternalModule of astModuleExportInfo.starExportedExternalModules) {
      if (starExportedExternalModule.externalModulePath !== undefined) {
        this._starExportedExternalModulePaths.push(starExportedExternalModule.externalModulePath);
      }
    }

    Sort.sortBy(this._entities, x => x.getSortKey());
    Sort.sortSet(this._dtsTypeReferenceDirectives);
    Sort.sortSet(this._dtsLibReferenceDirectives);
    this._starExportedExternalModulePaths.sort();
  }

  /**
   * For a given ts.Identifier that is part of an AstSymbol that we analyzed, return the CollectorEntity that
   * it refers to.  Returns undefined if it doesn't refer to anything interesting.
   * @remarks
   * Throws an Error if the ts.Identifier is not part of node tree that was analyzed.
   */
  public tryGetEntityForIdentifierNode(identifier: ts.Identifier): CollectorEntity | undefined {
    const astEntity: AstEntity | undefined = this.astSymbolTable.tryGetEntityForIdentifierNode(identifier);
    if (astEntity) {
      return this._entitiesByAstEntity.get(astEntity);
    }
    return undefined;
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

  public tryFetchMetadataForAstEntity(astEntity: AstEntity): SymbolMetadata | undefined {
    if (astEntity instanceof AstSymbol) {
      return this.fetchMetadata(astEntity);
    }
    if (astEntity.astSymbol) { // astImport
      return this.fetchMetadata(astEntity.astSymbol);
    }
    return undefined;
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

  private _createCollectorEntity(astEntity: AstEntity, exportedName: string | undefined): void {
    let entity: CollectorEntity | undefined = this._entitiesByAstEntity.get(astEntity);

    if (!entity) {
      entity = new CollectorEntity(astEntity);

      this._entitiesByAstEntity.set(astEntity, entity);
      this._entities.push(entity);

      if (astEntity instanceof AstSymbol) {
        this._collectReferenceDirectives(astEntity);
      }
    }

    if (exportedName) {
      entity.addExportName(exportedName);
    }
  }

  private _createEntityForIndirectReferences(astEntity: AstEntity, alreadySeenAstEntities: Set<AstEntity>): void {
    if (alreadySeenAstEntities.has(astEntity)) {
      return;
    }
    alreadySeenAstEntities.add(astEntity);

    if (astEntity instanceof AstSymbol) {
      astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
        for (const referencedAstEntity of astDeclaration.referencedAstEntities) {
          if (referencedAstEntity instanceof AstSymbol) {
            // We only create collector entities for root-level symbols.
            // For example, if a symbols is nested inside a namespace, only the root-level namespace
            // get a collector entity
            if (referencedAstEntity.parentAstSymbol === undefined) {
              this._createCollectorEntity(referencedAstEntity, undefined);
            }
          } else {
            this._createCollectorEntity(referencedAstEntity, undefined);
          }

          this._createEntityForIndirectReferences(referencedAstEntity, alreadySeenAstEntities);
        }
      });
    }
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();
    this._collectGlobalNames(usedNames);

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
      if (entity.exportNames.has(entity.astEntity.localName)) {
        entity.nameForEmit = entity.astEntity.localName;
        continue;
      }

      // In all other cases, generate a unique name based on the localName
      let suffix: number = 1;
      let nameForEmit: string = entity.astEntity.localName;
      while (usedNames.has(nameForEmit)) {
        nameForEmit = `${entity.astEntity.localName}_${++suffix}`;
      }
      entity.nameForEmit = nameForEmit;
      usedNames.add(nameForEmit);
    }
  }

  /**
   * Adds global names to the usedNames set, to prevent API Extractor from emitting names that conflict with
   * a global name.
   */
  private _collectGlobalNames(usedNames: Set<string>): void {
    // As a temporary workaround, this a short list of names that appear in typical projects.
    // The full solution is tracked by this issue:
    // https://github.com/Microsoft/web-build-tools/issues/1095
    const globalNames: string[] = [
      'Array',
      'ArrayConstructor',
      'Console',
      'Date',
      'DateConstructor',
      'Error',
      'ErrorConstructor',
      'Float32Array',
      'Float32ArrayConstructor',
      'Float64Array',
      'Float64ArrayConstructor',
      'IArguments',
      'Int16Array',
      'Int16ArrayConstructor',
      'Int32Array',
      'Int32ArrayConstructor',
      'Int8Array',
      'Int8ArrayConstructor',
      'Iterable',
      'IterableIterator',
      'Iterator',
      'IteratorResult',
      'Map',
      'MapConstructor',
      'Promise',
      'PromiseConstructor',
      'ReadonlyArray',
      'ReadonlyMap',
      'ReadonlySet',
      'Set',
      'SetConstructor',
      'String',
      'Symbol',
      'SymbolConstructor',
      'Uint16Array',
      'Uint16ArrayConstructor',
      'Uint32Array',
      'Uint32ArrayConstructor',
      'Uint8Array',
      'Uint8ArrayConstructor',
      'Uint8ClampedArray',
      'Uint8ClampedArrayConstructor',
      'WeakMap',
      'WeakMapConstructor',
      'WeakSet',
      'WeakSetConstructor',
      'clearInterval',
      'clearTimeout',
      'console',
      'setInterval',
      'setTimeout',
      'undefined'
    ];
    for (const globalName of globalNames) {
      usedNames.add(globalName);
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
          if (!astSymbol.isExternal) { // for now, don't report errors for external code
            this.messageRouter.addAnalyzerIssue(
              ExtractorMessageId.InconsistentReleaseTags,
              'This symbol has another declaration with a different release tag',
              astDeclaration
            );
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
        if (!astSymbol.isExternal) { // for now, don't report errors for external code
          // Don't report missing release tags for forgotten exports
          const entity: CollectorEntity | undefined = this._entitiesByAstEntity.get(astSymbol.rootAstSymbol);
          if (entity && entity.exported) {
            // We also don't report errors for the default export of an entry point, since its doc comment
            // isn't easy to obtain from the .d.ts file
            if (astSymbol.rootAstSymbol.localName !== '_default') {

              this.messageRouter.addAnalyzerIssue(
                ExtractorMessageId.MissingReleaseTag,
                'Missing release tag',
                astSymbol
              );
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
        if (!astDeclaration.astSymbol.isExternal) { // for now, don't report errors for external code
          this.messageRouter.addAnalyzerIssue(
            ExtractorMessageId.ExtraReleaseTag,
            'The doc comment should not contain more than one release tag',
            astDeclaration);
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
    const ranges: ts.CommentRange[] = TypeScriptInternals.getJSDocCommentRanges(nodeForComment, sourceFileText) || [];

    if (ranges.length === 0) {
      return undefined;
    }

    // We use the JSDoc comment block that is closest to the definition, i.e.
    // the last one preceding it
    const range: ts.TextRange = ranges[ranges.length - 1];

    const tsdocTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(sourceFileText,
      range.pos, range.end);

    const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(tsdocTextRange);

    this.messageRouter.addTsdocMessages(parserContext, declaration.getSourceFile());

    return parserContext;
  }

  private _collectReferenceDirectives(astSymbol: AstSymbol): void {
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
