// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { InternalError } from '@microsoft/node-core-library';

import { TypeScriptHelpers } from './TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { IAstImportOptions } from './AstImport';
import { AstModule, AstModuleExportInfo } from './AstModule';
import { TypeScriptInternals } from './TypeScriptInternals';
import { TypeScriptMessageFormatter } from './TypeScriptMessageFormatter';

/**
 * Exposes the minimal APIs from AstSymbolTable that are needed by ExportAnalyzer.
 *
 * In particular, we want ExportAnalyzer to be able to call AstSymbolTable._fetchAstSymbol() even though it
 * is a very private API that should not be exposed to any other components.
 */
export interface IAstSymbolTable {
  fetchAstSymbol(followedSymbol: ts.Symbol, addIfMissing: boolean,
    astImportOptions: IAstImportOptions | undefined, localName?: string): AstSymbol | undefined;

  analyze(astSymbol: AstSymbol): void;
}

/**
 * Used with ExportAnalyzer.fetchAstModuleBySourceFile() to provide contextual information about how the source file
 * was imported.
 */
interface IAstModuleReference {
  /**
   * For example, if we are following a statement like `import { X } from 'some-package'`, this will be the
   * string `"some-package"`.
   */
  moduleSpecifier: string;

  /**
   * For example, if we are following a statement like `import { X } from 'some-package'`, this will be the
   * symbol for `X`.
   */
  moduleSpecifierSymbol: ts.Symbol;
}

/**
 * The ExportAnalyzer is an internal part of AstSymbolTable that has been moved out into its own source file
 * because it is a complex and mostly self-contained algorithm.
 *
 * Its job is to build up AstModule objects by crawling import statements to discover where declarations come from.
 * This is conceptually the same as the compiler's own TypeChecker.getExportsOfModule(), except that when
 * ExportAnalyzer encounters a declaration that was imported from an external package, it remembers how it was imported
 * (i.e. the AstImport object).  Today the compiler API does not expose this information, which is crucial for
 * generating .d.ts rollups.
 */
export class ExportAnalyzer {
  private readonly _program: ts.Program;
  private readonly _typeChecker: ts.TypeChecker;
  private readonly _astSymbolTable: IAstSymbolTable;

  private readonly _astModulesBySourceFile: Map<ts.SourceFile, AstModule>
    = new Map<ts.SourceFile, AstModule>();

  // Used with isImportableAmbientSourceFile()
  private readonly _importableAmbientSourceFiles: Set<ts.SourceFile> = new Set<ts.SourceFile>();

  public constructor(program: ts.Program, typeChecker: ts.TypeChecker, astSymbolTable: IAstSymbolTable) {
    this._program = program;
    this._typeChecker = typeChecker;
    this._astSymbolTable = astSymbolTable;
  }

  /**
   * For a given source file, this analyzes all of its exports and produces an AstModule object.
   *
   * @param moduleReference - contextual information about the import statement that took us to this source file,
   * or `undefined` if this source file is the initial entry point
   */
  public fetchAstModuleBySourceFile(sourceFile: ts.SourceFile,
    moduleReference: IAstModuleReference | undefined): AstModule {

    // Don't traverse into a module that we already processed before:
    // The compiler allows m1 to have "export * from 'm2'" and "export * from 'm3'",
    // even if m2 and m3 both have "export * from 'm4'".
    let astModule: AstModule | undefined = this._astModulesBySourceFile.get(sourceFile);

    if (!astModule) {
      const moduleSymbol: ts.Symbol = this._getSymbolForSourceFile(sourceFile, moduleReference);

      // (If moduleReference === undefined, then this is the entry point of the local project being analyzed.)
      let externalModulePath: string | undefined = undefined;
      if (moduleReference !== undefined) {
        // Match:       "@microsoft/sp-lodash-subset" or "lodash/has"
        // but ignore:  "../folder/LocalFile"
        if (!ts.isExternalModuleNameRelative(moduleReference.moduleSpecifier)) {
          // This makes astModule.isExternal=true
          externalModulePath = moduleReference.moduleSpecifier;
        }
      }

      astModule = new AstModule(sourceFile, moduleSymbol, externalModulePath);
      this._astModulesBySourceFile.set(sourceFile, astModule);

      if (astModule.isExternal) {
        // It's an external package, so do the special simplified analysis that doesn't crawl into referenced modules
        for (const exportedSymbol of this._typeChecker.getExportsOfModule(moduleSymbol)) {

          if (externalModulePath === undefined) {
            throw new InternalError('Failed assertion: externalModulePath=undefined but astModule.isExternal=true');
          }

          const astImportOptions: IAstImportOptions = {
            exportName: exportedSymbol.name,
            modulePath: externalModulePath
          };

          const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(exportedSymbol, this._typeChecker);

          // Ignore virtual symbols that don't have any declarations
          if (TypeScriptHelpers.hasAnyDeclarations(followedSymbol)) {
            const astSymbol: AstSymbol | undefined = this._astSymbolTable.fetchAstSymbol(
              followedSymbol, true, astImportOptions);

            if (!astSymbol) {
              throw new Error(`Unsupported export ${JSON.stringify(exportedSymbol.name)} in `
                + TypeScriptMessageFormatter.formatFileAndLineNumber(followedSymbol.declarations[0]));
            }

            astModule.cachedExportedSymbols.set(exportedSymbol.name, astSymbol);
          }
        }
      } else {
        // The module is part of the local project, so do the full analysis

        if (moduleSymbol.exports) {
          // The "export * from 'module-name';" declarations are all attached to a single virtual symbol
          // whose name is InternalSymbolName.ExportStar
          const exportStarSymbol: ts.Symbol | undefined = moduleSymbol.exports.get(ts.InternalSymbolName.ExportStar);
          if (exportStarSymbol) {
            for (const exportStarDeclaration of exportStarSymbol.getDeclarations() || []) {
              if (ts.isExportDeclaration(exportStarDeclaration)) {

                const starExportedModule: AstModule | undefined = this._fetchSpecifierAstModule(exportStarDeclaration,
                  exportStarSymbol);

                if (starExportedModule !== undefined) {
                  astModule.starExportedModules.add(starExportedModule);
                }
              } else {
                // Ignore ExportDeclaration nodes that don't match the expected pattern
                // TODO: Should we report a warning?
              }
            }
          }
        }

      }
    }

    return astModule;
  }

  /**
   * Retrieves the symbol for the module corresponding to the ts.SourceFile that is being imported/exported.
   */
  private _getSymbolForSourceFile(sourceFile: ts.SourceFile,
    moduleReference: IAstModuleReference | undefined): ts.Symbol {

    const moduleSymbol: ts.Symbol | undefined = TypeScriptInternals.tryGetSymbolForDeclaration(sourceFile);
    if (moduleSymbol !== undefined) {
      // This is the normal case.  The SourceFile acts is a module and has a symbol.
      return moduleSymbol;
    }

    if (moduleReference !== undefined) {
      // But there is also an elaborate case where the source file contains one or more "module" declarations,
      // and our moduleReference took us to one of those.

      // tslint:disable-next-line:no-bitwise
      if ((moduleReference.moduleSpecifierSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
        // Follow the import/export declaration to one hop the exported item inside the target module
        let followedSymbol: ts.Symbol | undefined = TypeScriptInternals.getImmediateAliasedSymbol(
          moduleReference.moduleSpecifierSymbol, this._typeChecker);

        if (followedSymbol === undefined) {
          // This is a workaround for a compiler bug where getImmediateAliasedSymbol() sometimes returns undefined
          followedSymbol = this._typeChecker.getAliasedSymbol(moduleReference.moduleSpecifierSymbol);
        }

        if (followedSymbol !== undefined && followedSymbol !== moduleReference.moduleSpecifierSymbol) {
          // The parent of the exported symbol will be the module that we're importing from
          const parent: ts.Symbol | undefined = TypeScriptInternals.getSymbolParent(followedSymbol);
          if (parent !== undefined) {
            // Make sure the thing we found is a module
            // tslint:disable-next-line:no-bitwise
            if ((parent.flags & ts.SymbolFlags.ValueModule) !== 0) {
              // Record that that this is an ambient module that can also be imported from
              this._importableAmbientSourceFiles.add(sourceFile);
              return parent;
            }
          }
        }
      }
    }

    throw new InternalError('Unable to determine module for: ' + sourceFile.fileName);
  }

  /**
   * This crawls the specified entry point and collects the full set of exported AstSymbols.
   */
  public fetchAstModuleExportInfo(astModule: AstModule): AstModuleExportInfo {
    if (astModule.astModuleExportInfo === undefined) {
      const astModuleExportInfo: AstModuleExportInfo = new AstModuleExportInfo();

      this._collectAllExportsRecursive(astModuleExportInfo, astModule, new Set<AstModule>());

      astModule.astModuleExportInfo = astModuleExportInfo;
    }
    return astModule.astModuleExportInfo;
  }

  /**
   * Returns true if when we analyzed sourceFile, we found that it contains an "export=" statement that allows
   * it to behave /either/ as an ambient module /or/ as a regular importable module.  In this case,
   * `AstSymbolTable._fetchAstSymbol()` will analyze its symbols even though `TypeScriptHelpers.isAmbient()`
   * returns true.
   */
  public isImportableAmbientSourceFile(sourceFile: ts.SourceFile): boolean {
    return this._importableAmbientSourceFiles.has(sourceFile);
  }

  private _collectAllExportsRecursive(astModuleExportInfo: AstModuleExportInfo, astModule: AstModule,
    visitedAstModules: Set<AstModule>): void {

    if (visitedAstModules.has(astModule)) {
      return;
    }
    visitedAstModules.add(astModule);

    if (astModule.isExternal) {
      astModuleExportInfo.starExportedExternalModules.add(astModule);
    } else {
      // Fetch each of the explicit exports for this module
      if (astModule.moduleSymbol.exports) {
        astModule.moduleSymbol.exports.forEach((exportSymbol, exportName) => {
          switch (exportName) {
            case ts.InternalSymbolName.ExportStar:
            case ts.InternalSymbolName.ExportEquals:
              break;
            default:
              // Don't collect the "export default" symbol unless this is the entry point module
              if (exportName !== ts.InternalSymbolName.Default || visitedAstModules.size === 1) {
                if (!astModuleExportInfo.exportedLocalSymbols.has(exportSymbol.name)) {
                  const astSymbol: AstSymbol = this._getExportOfAstModule(exportSymbol.name, astModule);
                  this._astSymbolTable.analyze(astSymbol);
                  astModuleExportInfo.exportedLocalSymbols.set(exportSymbol.name, astSymbol);
                }
              }
              break;
          }
        });
      }

      for (const starExportedModule of astModule.starExportedModules) {
        this._collectAllExportsRecursive(astModuleExportInfo, starExportedModule, visitedAstModules);
      }
    }
  }

  /**
   * For a given symbol (which was encountered in the specified sourceFile), this fetches the AstSymbol that it
   * refers to.  For example, if a particular interface describes the return value of a function, this API can help
   * us determine a TSDoc declaration reference for that symbol (if the symbol is exported).
   */
  public fetchReferencedAstSymbol(symbol: ts.Symbol): AstSymbol | undefined {
    return this._fetchAstSymbolFromModule(symbol);
  }

  private _fetchAstSymbolFromModule(symbol: ts.Symbol): AstSymbol | undefined {
    let current: ts.Symbol = symbol;

    while (true) { // tslint:disable-line:no-constant-condition

      // Is this symbol an import/export that we need to follow to find the real declaration?
      for (const declaration of current.declarations || []) {
        let matchedAstSymbol: AstSymbol | undefined;
        matchedAstSymbol = this._tryMatchExportDeclaration(declaration, current);
        if (matchedAstSymbol !== undefined) {
          return matchedAstSymbol;
        }
        matchedAstSymbol = this._tryMatchImportDeclaration(declaration, current);
        if (matchedAstSymbol !== undefined) {
          return matchedAstSymbol;
        }
      }

      if (!(current.flags & ts.SymbolFlags.Alias)) { // tslint:disable-line:no-bitwise
        break;
      }

      const currentAlias: ts.Symbol = TypeScriptInternals.getImmediateAliasedSymbol(current, this._typeChecker);
      // Stop if we reach the end of the chain
      if (!currentAlias || currentAlias === current) {
        break;
      }

      current = currentAlias;
    }

    // Otherwise, assume it is a normal declaration
    const astSymbol: AstSymbol | undefined = this._astSymbolTable.fetchAstSymbol(current, true, undefined);
    return astSymbol;
  }

  private _tryMatchExportDeclaration(declaration: ts.Declaration, declarationSymbol: ts.Symbol): AstSymbol | undefined {

    const exportDeclaration: ts.ExportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ExportDeclaration>(declaration, ts.SyntaxKind.ExportDeclaration);

    if (exportDeclaration) {
      let exportName: string | undefined = undefined;

      if (declaration.kind === ts.SyntaxKind.ExportSpecifier) {
        // EXAMPLE:
        // "export { A } from './file-a';"
        //
        // ExportDeclaration:
        //   ExportKeyword:  pre=[export] sep=[ ]
        //   NamedExports:
        //     FirstPunctuation:  pre=[{] sep=[ ]
        //     SyntaxList:
        //       ExportSpecifier:  <------------- declaration
        //         Identifier:  pre=[A] sep=[ ]
        //     CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['./file-a']
        //   SemicolonToken:  pre=[;]

        // Example: " ExportName as RenamedName"
        const exportSpecifier: ts.ExportSpecifier = declaration as ts.ExportSpecifier;
        exportName = (exportSpecifier.propertyName || exportSpecifier.name).getText().trim();
      } else {
        throw new InternalError('Unimplemented export declaration kind: ' + declaration.getText());
      }

      // Ignore "export { A }" without a module specifier
      if (exportDeclaration.moduleSpecifier) {
        const specifierAstModule: AstModule = this._fetchSpecifierAstModule(exportDeclaration, declarationSymbol);
        const astSymbol: AstSymbol = this._getExportOfAstModule(exportName, specifierAstModule);
        return astSymbol;
      }
    }

    return undefined;
  }

  private _tryMatchImportDeclaration(declaration: ts.Declaration, declarationSymbol: ts.Symbol): AstSymbol | undefined {

    const importDeclaration: ts.ImportDeclaration | undefined
      = TypeScriptHelpers.findFirstParent<ts.ImportDeclaration>(declaration, ts.SyntaxKind.ImportDeclaration);

    if (importDeclaration) {
      const specifierAstModule: AstModule = this._fetchSpecifierAstModule(importDeclaration, declarationSymbol);

      if (declaration.kind === ts.SyntaxKind.NamespaceImport) {
        // EXAMPLE:
        // "import * as theLib from 'the-lib';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:
        //     NamespaceImport:  <------------- declaration
        //       AsteriskToken:  pre=[*] sep=[ ]
        //       AsKeyword:  pre=[as] sep=[ ]
        //       Identifier:  pre=[theLib] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['the-lib']
        //   SemicolonToken:  pre=[;]

        if (specifierAstModule.externalModulePath === undefined) {
          // The implementation here only works when importing from an external module.
          // The full solution is tracked by: https://github.com/Microsoft/web-build-tools/issues/1029
          throw new Error('"import * as ___ from ___;" is not supported yet for local files.'
            + '\nFailure in: ' + importDeclaration.getSourceFile().fileName);
        }

        const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(declarationSymbol, this._typeChecker);

        const astImportOptions: IAstImportOptions = {
          exportName: '*',
          modulePath: specifierAstModule.externalModulePath
        };

        const astSymbol: AstSymbol | undefined = this._astSymbolTable.fetchAstSymbol(followedSymbol, true,
          astImportOptions, declarationSymbol.name);
        return astSymbol;
      }

      if (declaration.kind === ts.SyntaxKind.ImportSpecifier) {
        // EXAMPLE:
        // "import { A, B } from 'the-lib';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:
        //     NamedImports:
        //       FirstPunctuation:  pre=[{] sep=[ ]
        //       SyntaxList:
        //         ImportSpecifier:  <------------- declaration
        //           Identifier:  pre=[A]
        //         CommaToken:  pre=[,] sep=[ ]
        //         ImportSpecifier:
        //           Identifier:  pre=[B] sep=[ ]
        //       CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['the-lib']
        //   SemicolonToken:  pre=[;]

        // Example: " ExportName as RenamedName"
        const importSpecifier: ts.ImportSpecifier = declaration as ts.ImportSpecifier;
        const exportName: string = (importSpecifier.propertyName || importSpecifier.name).getText().trim();
        const astSymbol: AstSymbol = this._getExportOfAstModule(exportName, specifierAstModule);
        return astSymbol;
      } else if (declaration.kind === ts.SyntaxKind.ImportClause) {
        // EXAMPLE:
        // "import A, { B } from './A';"
        //
        // ImportDeclaration:
        //   ImportKeyword:  pre=[import] sep=[ ]
        //   ImportClause:  <------------- declaration (referring to A)
        //     Identifier:  pre=[A]
        //     CommaToken:  pre=[,] sep=[ ]
        //     NamedImports:
        //       FirstPunctuation:  pre=[{] sep=[ ]
        //       SyntaxList:
        //         ImportSpecifier:
        //           Identifier:  pre=[B] sep=[ ]
        //       CloseBraceToken:  pre=[}] sep=[ ]
        //   FromKeyword:  pre=[from] sep=[ ]
        //   StringLiteral:  pre=['./A']
        //   SemicolonToken:  pre=[;]
        const astSymbol: AstSymbol = this._getExportOfAstModule(ts.InternalSymbolName.Default, specifierAstModule);
        return astSymbol;
      } else {
        throw new InternalError('Unimplemented import declaration kind: ' + declaration.getText());
      }
    }

    return undefined;
  }

  private _getExportOfAstModule(exportName: string, astModule: AstModule): AstSymbol {
    const visitedAstModules: Set<AstModule> = new Set<AstModule>();
    const astSymbol: AstSymbol | undefined = this._tryGetExportOfAstModule(exportName, astModule, visitedAstModules);
    if (astSymbol === undefined) {
      throw new InternalError(`Unable to analyze the export ${JSON.stringify(exportName)} in\n`
        + astModule.sourceFile.fileName);
    }
    return astSymbol;
  }

  private _tryGetExportOfAstModule(exportName: string, astModule: AstModule,
    visitedAstModules: Set<AstModule>): AstSymbol | undefined {

    if (visitedAstModules.has(astModule)) {
      return undefined;
    }
    visitedAstModules.add(astModule);

    let astSymbol: AstSymbol | undefined = astModule.cachedExportedSymbols.get(exportName);
    if (astSymbol !== undefined) {
      return astSymbol;
    }

    // Try the explicit exports
    const escapedExportName: ts.__String = ts.escapeLeadingUnderscores(exportName);
    if (astModule.moduleSymbol.exports) {
      const exportSymbol: ts.Symbol | undefined = astModule.moduleSymbol.exports.get(escapedExportName);
      if (exportSymbol) {
        astSymbol = this._fetchAstSymbolFromModule(exportSymbol);
        if (astSymbol !== undefined) {
          astModule.cachedExportedSymbols.set(exportName, astSymbol); // cache for next time
          return astSymbol;
        }
      }
    }

    // Try each of the star imports
    for (const starExportedModule of astModule.starExportedModules) {
      astSymbol = this._tryGetExportOfAstModule(exportName, starExportedModule, visitedAstModules);
      if (astSymbol !== undefined) {
        return astSymbol;
      }
    }

    return undefined;
  }

  /**
   * Given an ImportDeclaration of the form `export * from "___";`, this interprets the module specifier (`"___"`)
   * and fetches the corresponding AstModule object.
   */
  private _fetchSpecifierAstModule(importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration,
    exportStarSymbol: ts.Symbol): AstModule {

    // The name of the module, which could be like "./SomeLocalFile' or like 'external-package/entry/point'
    const moduleSpecifier: string | undefined = TypeScriptHelpers.getModuleSpecifier(importOrExportDeclaration);
    if (!moduleSpecifier) {
      throw new InternalError('Unable to parse module specifier');
    }

    const resolvedModule: ts.ResolvedModuleFull | undefined = TypeScriptInternals.getResolvedModule(
      importOrExportDeclaration.getSourceFile(), moduleSpecifier);

    if (resolvedModule === undefined) {
      // This should not happen, since getResolvedModule() specifically looks up names that the compiler
      // found in export declarations for this source file
      throw new InternalError('getResolvedModule() could not resolve module name ' + JSON.stringify(moduleSpecifier));
    }

    // Map the filename back to the corresponding SourceFile. This circuitous approach is needed because
    // we have no way to access the compiler's internal resolveExternalModuleName() function
    const moduleSourceFile: ts.SourceFile | undefined = this._program.getSourceFile(resolvedModule.resolvedFileName);
    if (!moduleSourceFile) {
      // This should not happen, since getResolvedModule() specifically looks up names that the compiler
      // found in export declarations for this source file
      throw new InternalError('getSourceFile() failed to locate ' + JSON.stringify(resolvedModule.resolvedFileName));
    }

    const specifierAstModule: AstModule = this.fetchAstModuleBySourceFile(moduleSourceFile, {
      moduleSpecifier: moduleSpecifier,
      moduleSpecifierSymbol: exportStarSymbol
    });

    return specifierAstModule;
  }
}
