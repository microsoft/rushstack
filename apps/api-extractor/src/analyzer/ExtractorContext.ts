// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as path from 'path';
import {
  PackageJsonLookup,
  IPackageJson,
  PackageName,
  IParsedPackageName
} from '@microsoft/node-core-library';

import { ILogger } from '../api/ILogger';
import { IExtractorPoliciesConfig, IExtractorValidationRulesConfig } from '../api/IExtractorConfig';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';

/**
 * Options for ExtractorContext constructor.
 */
export interface IExtractorContextParameters {
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

  constructor(parameters: IExtractorContextParameters) {
    this.packageJsonLookup = new PackageJsonLookup();

    this.policies = parameters.policies;
    this.validationRules = parameters.validationRules;

    const folder: string | undefined = this.packageJsonLookup.tryGetPackageFolderFor(parameters.entryPointFile);
    if (!folder) {
      throw new Error('Unable to find a package.json for entry point: ' + parameters.entryPointFile);
    }
    this._packageFolder = folder;

    this.packageJson = this.packageJsonLookup.tryLoadPackageJsonFor(this._packageFolder)!;

    this.parsedPackageName = PackageName.parse(this.packageJson.name);

    this._logger = parameters.logger;

    // This runs a full type analysis, and then augments the Abstract Syntax Tree (i.e. declarations)
    // with semantic information (i.e. symbols).  The "diagnostics" are a subset of the everyday
    // compile errors that would result from a full compilation.
    for (const diagnostic of parameters.program.getSemanticDiagnostics()) {
      const errorText: string = TypeScriptMessageFormatter.format(diagnostic.messageText);
      this.reportError(`TypeScript: ${errorText}`, diagnostic.file, diagnostic.start);
    }

    this.typeChecker = parameters.program.getTypeChecker();

    const entryPointSourceFile: ts.SourceFile | undefined = parameters.program.getSourceFile(parameters.entryPointFile);
    if (!entryPointSourceFile) {
      throw new Error('Unable to load file: ' + parameters.entryPointFile);
    }

    this.entryPointSourceFile = entryPointSourceFile;
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
}
