// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as fsx from 'fs-extra';
import * as path from 'path';
import { PackageJsonLookup } from '@microsoft/node-core-library';

import { AstPackage } from './ast/AstPackage';
import { DocItemLoader } from './DocItemLoader';
import { ILogger } from './extractor/ILogger';
import { IExtractorPoliciesConfig, IExtractorValidationRulesConfig } from './extractor/IExtractorConfig';

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
  public package: AstPackage;
  /**
   * One DocItemLoader is needed per analyzer to look up external API members
   * as needed.
   */
  public readonly docItemLoader: DocItemLoader;

  public readonly packageJsonLookup: PackageJsonLookup;

  public readonly policies: IExtractorPoliciesConfig;

  public readonly validationRules: IExtractorValidationRulesConfig;

  private _packageName: string;

  // If the entry point is "C:\Folder\project\src\index.ts" and the nearest package.json
  // is "C:\Folder\project\package.json", then the packageFolder is "C:\Folder\project"
  private _packageFolder: string;

  private _logger: ILogger;

  constructor(options: IExtractorContextOptions) {
    this.packageJsonLookup = new PackageJsonLookup();

    this.policies = options.policies;
    this.validationRules = options.validationRules;

    const folder: string | undefined = this.packageJsonLookup.tryGetPackageFolder(options.entryPointFile);
    if (!folder) {
      throw new Error('Unable to find a package.json for entry point: ' + options.entryPointFile);
    }
    this._packageFolder = folder;

    this._packageName = this.packageJsonLookup.getPackageName(this._packageFolder);

    this.docItemLoader = new DocItemLoader(this._packageFolder);

    this._logger = options.logger;

    // This runs a full type analysis, and then augments the Abstract Syntax Tree (i.e. declarations)
    // with semantic information (i.e. symbols).  The "diagnostics" are a subset of the everyday
    // compile errors that would result from a full compilation.
    for (const diagnostic of options.program.getSemanticDiagnostics()) {
      this.reportError('TypeScript: ' + diagnostic.messageText, diagnostic.file, diagnostic.start);
    }

    this.typeChecker = options.program.getTypeChecker();

    const rootFile: ts.SourceFile = options.program.getSourceFile(options.entryPointFile);
    if (!rootFile) {
      throw new Error('Unable to load file: ' + options.entryPointFile);
    }

    this.package = new AstPackage(this, rootFile); // construct members
    this.package.completeInitialization(); // creates ApiDocumentation
    this.package.visitTypeReferencesForAstItem();
  }

  /**
   * Returns the full name of the package being analyzed.
   */
  public get packageName(): string {
    return this._packageName;
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

  /**
   * Scans for external package api files and loads them into the docItemLoader member before
   * any API analysis begins.
   *
   * @param externalJsonCollectionPath - an absolute path to to the folder that contains all the external
   * api json files.
   * Ex: if externalJsonPath is './resources', then in that folder
   * are 'es6-collections.api.json', etc.
   */
  public loadExternalPackages(externalJsonCollectionPath: string): void {
    if (!externalJsonCollectionPath) {
      return;
    }

    const files: string[] = fsx.readdirSync(externalJsonCollectionPath);
    files.forEach(file => {
      if (path.extname(file) === '.json') {
        const externalJsonFilePath: string = path.join(externalJsonCollectionPath, file);

        // Example: "C:\Example\my-package.json" --> "my-package"
        const packageName: string = path.parse(file).name;
        this.docItemLoader.loadPackageIntoCache(externalJsonFilePath, packageName);
      }
    });
  }
}
