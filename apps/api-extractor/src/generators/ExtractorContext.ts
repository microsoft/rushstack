// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as path from 'path';
import * as tsdoc from '@microsoft/tsdoc';
import {
  PackageJsonLookup,
  IPackageJson,
  PackageName,
  IParsedPackageName,
  Sort
} from '@microsoft/node-core-library';

import { ILogger } from '../api/ILogger';
import { IExtractorPoliciesConfig, IExtractorValidationRulesConfig } from '../api/IExtractorConfig';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';
import { DtsEntry } from './DtsEntry';
import { AstSymbolTable } from '../analyzer/AstSymbolTable';
import { AstEntryPoint } from '../analyzer/AstEntryPoint';
import { AstSymbol } from '../analyzer/AstSymbol';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';

/**
 * Options for ExtractorContext constructor.
 */
export interface IExtractorContextOptions {
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
export class ExtractorContext {
  public typeChecker: ts.TypeChecker;
  public astSymbolTable: AstSymbolTable;

  /**
   * The parsed package.json file for this package.
   */
  public readonly packageJson: IPackageJson;

  public readonly parsedPackageName: IParsedPackageName;

  public readonly packageJsonLookup: PackageJsonLookup;

  public readonly policies: IExtractorPoliciesConfig;

  public readonly validationRules: IExtractorValidationRulesConfig;

  public readonly entryPointSourceFile: ts.SourceFile;

  // If the entry point is "C:\Folder\project\src\index.ts" and the nearest package.json
  // is "C:\Folder\project\package.json", then the packageFolder is "C:\Folder\project"
  private _packageFolder: string;

  private _logger: ILogger;

  private _tsdocParser: tsdoc.TSDocParser;
  private _astEntryPoint: AstEntryPoint | undefined;

  private _dtsEntries: DtsEntry[] = [];
  private _dtsEntriesByAstSymbol: Map<AstSymbol, DtsEntry> = new Map<AstSymbol, DtsEntry>();
  private _dtsEntriesBySymbol: Map<ts.Symbol, DtsEntry> = new Map<ts.Symbol, DtsEntry>();
  private _releaseTagByAstSymbol: Map<AstSymbol, ReleaseTag> = new Map<AstSymbol, ReleaseTag>();

  private _dtsTypeDefinitionReferences: string[] = [];

  constructor(options: IExtractorContextOptions) {
    this.packageJsonLookup = new PackageJsonLookup();

    this.policies = options.policies;
    this.validationRules = options.validationRules;

    const folder: string | undefined = this.packageJsonLookup.tryGetPackageFolderFor(options.entryPointFile);
    if (!folder) {
      throw new Error('Unable to find a package.json for entry point: ' + options.entryPointFile);
    }
    this._packageFolder = folder;

    this.packageJson = this.packageJsonLookup.tryLoadPackageJsonFor(this._packageFolder)!;

    this.parsedPackageName = PackageName.parse(this.packageJson.name);

    this._logger = options.logger;

    // This runs a full type analysis, and then augments the Abstract Syntax Tree (i.e. declarations)
    // with semantic information (i.e. symbols).  The "diagnostics" are a subset of the everyday
    // compile errors that would result from a full compilation.
    for (const diagnostic of options.program.getSemanticDiagnostics()) {
      const errorText: string = TypeScriptMessageFormatter.format(diagnostic.messageText);
      this.reportError(`TypeScript: ${errorText}`, diagnostic.file, diagnostic.start);
    }

    this.typeChecker = options.program.getTypeChecker();

    const entryPointSourceFile: ts.SourceFile | undefined = options.program.getSourceFile(options.entryPointFile);
    if (!entryPointSourceFile) {
      throw new Error('Unable to load file: ' + options.entryPointFile);
    }

    this.entryPointSourceFile = entryPointSourceFile;

    this._tsdocParser = new tsdoc.TSDocParser();
    this.astSymbolTable = new AstSymbolTable(this.typeChecker, this.packageJsonLookup);
  }

  /**
   * Returns the full name of the package being analyzed.
   */
  public get packageName(): string {
    return this.packageJson.name;
  }

  /**
   * Returns the folder for the package being analyzed.
   */
  public get packageFolder(): string {
    return this._packageFolder;
  }

  /**
   * Returns a list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * /// <reference types="example-library" />
   */
  public get dtsTypeDefinitionReferences(): ReadonlyArray<string> {
    return this._dtsTypeDefinitionReferences;
  }

  public get dtsEntries(): ReadonlyArray<DtsEntry> {
    return this._dtsEntries;
  }

  /**
   * Perform the analysis.
   */
  public analyze(): void {
    if (this._astEntryPoint) {
      throw new Error('DtsRollupGenerator.analyze() was already called');
    }

    // Build the entry point
    this._astEntryPoint = this.astSymbolTable.fetchEntryPoint(this.entryPointSourceFile);

    const exportedAstSymbols: AstSymbol[] = [];

    // Create a DtsEntry for each top-level export
    for (const exportedMember of this._astEntryPoint.exportedMembers) {
      const astSymbol: AstSymbol = exportedMember.astSymbol;

      this._createDtsEntryForSymbol(exportedMember.astSymbol, exportedMember.name);

      exportedAstSymbols.push(astSymbol);
    }

    // Create a DtsEntry for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstSymbols: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstSymbol of exportedAstSymbols) {
      this._createDtsEntryForIndirectReferences(exportedAstSymbol, alreadySeenAstSymbols);
    }

    this._makeUniqueNames();

    Sort.sortBy(this._dtsEntries, x => x.getSortKey());
    this._dtsTypeDefinitionReferences.sort();
  }

  public tryGetDtsEntryBySymbol(symbol: ts.Symbol): DtsEntry | undefined {
    return this._dtsEntriesBySymbol.get(symbol);
  }

  private _createDtsEntryForSymbol(astSymbol: AstSymbol, exportedName: string | undefined): void {
    let dtsEntry: DtsEntry | undefined = this._dtsEntriesByAstSymbol.get(astSymbol);

    if (!dtsEntry) {
      dtsEntry = new DtsEntry({
        astSymbol: astSymbol,
        originalName: exportedName || astSymbol.localName,
        exported: !!exportedName
      });

      this._dtsEntriesByAstSymbol.set(astSymbol, dtsEntry);
      this._dtsEntriesBySymbol.set(astSymbol.followedSymbol, dtsEntry);
      this._dtsEntries.push(dtsEntry);

      this._collectTypeDefinitionReferences(astSymbol);
    } else {
      if (exportedName) {
        if (!dtsEntry.exported) {
          throw new Error('Program Bug: DtsEntry should have been marked as exported');
        }
        if (dtsEntry.originalName !== exportedName) {
          throw new Error(`The symbol ${exportedName} was also exported as ${dtsEntry.originalName};`
            + ` this is not supported yet`);
        }
      }
    }
  }

  private _createDtsEntryForIndirectReferences(astSymbol: AstSymbol, alreadySeenAstSymbols: Set<AstSymbol>): void {
    if (alreadySeenAstSymbols.has(astSymbol)) {
      return;
    }
    alreadySeenAstSymbols.add(astSymbol);

    astSymbol.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
      for (const referencedAstSymbol of astDeclaration.referencedAstSymbols) {
        this._createDtsEntryForSymbol(referencedAstSymbol, undefined);
        this._createDtsEntryForIndirectReferences(referencedAstSymbol, alreadySeenAstSymbols);
      }
    });
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();

    // First collect the explicit package exports
    for (const dtsEntry of this._dtsEntries) {
      if (dtsEntry.exported) {

        if (usedNames.has(dtsEntry.originalName)) {
          // This should be impossible
          throw new Error(`Program bug: a package cannot have two exports with the name ${dtsEntry.originalName}`);
        }

        dtsEntry.nameForEmit = dtsEntry.originalName;

        usedNames.add(dtsEntry.nameForEmit);
      }
    }

    // Next generate unique names for the non-exports that will be emitted
    for (const dtsEntry of this._dtsEntries) {
      if (!dtsEntry.exported) {
        let suffix: number = 1;
        dtsEntry.nameForEmit = dtsEntry.originalName;

        while (usedNames.has(dtsEntry.nameForEmit)) {
          dtsEntry.nameForEmit = `${dtsEntry.originalName}_${++suffix}`;
        }

        usedNames.add(dtsEntry.nameForEmit);
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
      const relativePath: string = path.relative(this.packageFolder, sourceFile.fileName);
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
