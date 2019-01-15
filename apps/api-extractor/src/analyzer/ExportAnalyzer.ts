// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { InternalError } from '@microsoft/node-core-library';

import { TypeScriptHelpers } from './TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { IAstImportOptions } from './AstImport';
import { AstModule } from './AstModule';

export class ExportAnalyzer {
  public fetchAstSymbol: (followedSymbol: ts.Symbol, addIfMissing: boolean,
    astImportOptions: IAstImportOptions | undefined) => AstSymbol | undefined;

  private readonly _program: ts.Program;
  private readonly _typeChecker: ts.TypeChecker;

  private readonly _astModulesBySourceFile: Map<ts.SourceFile, AstModule>
    = new Map<ts.SourceFile, AstModule>();

  public constructor(program: ts.Program, typeChecker: ts.TypeChecker) {
    this._program = program;
    this._typeChecker = typeChecker;
  }

  /**
   * For a given source file, this analyzes all of its exports and produces an AstModule
   * object.
   */
  public fetchAstModuleBySourceFile(sourceFile: ts.SourceFile, moduleSpecifier: string | undefined): AstModule {
    // Don't traverse into a module that we already processed before:
    // The compiler allows m1 to have "export * from 'm2'" and "export * from 'm3'",
    // even if m2 and m3 both have "export * from 'm4'".
    let astModule: AstModule | undefined = this._astModulesBySourceFile.get(sourceFile);

    if (!astModule) {
      astModule = new AstModule(sourceFile);
      this._astModulesBySourceFile.set(sourceFile, astModule);

      const moduleSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(sourceFile);

      // Match:       "@microsoft/sp-lodash-subset" or "lodash/has"
      // but ignore:  "../folder/LocalFile"
      if (moduleSpecifier !== undefined && !ts.isExternalModuleNameRelative(moduleSpecifier)) {
        // Yes, this is the entry point for an external package.
        astModule.externalModulePath = moduleSpecifier;

        for (const exportedSymbol of this._typeChecker.getExportsOfModule(moduleSymbol)) {

          const astImportOptions: IAstImportOptions = {
            exportName: exportedSymbol.name,
            modulePath: astModule.externalModulePath
          };

          const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(exportedSymbol, this._typeChecker);
          const astSymbol: AstSymbol | undefined = this.fetchAstSymbol(followedSymbol, true, astImportOptions);

          if (!astSymbol) {
            throw new Error('Unsupported export: ' + exportedSymbol.name);
          }

          astModule.exportedSymbols.set(exportedSymbol.name, astSymbol);
        }
      } else {

        if (moduleSymbol.exports) {
          for (const exportedSymbol of moduleSymbol.exports.values() as IterableIterator<ts.Symbol>) {

            if (exportedSymbol.escapedName === ts.InternalSymbolName.ExportStar) {
              // Special handling for "export * from 'module-name';" declarations, which are all attached to a single
              // symbol whose name is InternalSymbolName.ExportStar
              for (const exportStarDeclaration of exportedSymbol.getDeclarations() || []) {
                this._collectExportsFromExportStar(astModule, exportStarDeclaration);
              }

            } else {
              this._collectExportForAstModule(astModule, exportedSymbol);
            }
          }

        }

      }
    }

    return astModule;
  }

  private _collectExportForAstModule(astModule: AstModule, exportedSymbol: ts.Symbol): void {
    let current: ts.Symbol = exportedSymbol;

    while (true) { // tslint:disable-line:no-constant-condition

      // Is this symbol an import/export that we need to follow to find the real declaration?
      for (const declaration of current.declarations || []) {
        const exportDeclaration: ts.ExportDeclaration | undefined
          = TypeScriptHelpers.findFirstParent<ts.ExportDeclaration>(declaration, ts.SyntaxKind.ExportDeclaration);

        if (exportDeclaration) {
          let exportName: string;

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
            throw new Error('Unimplemented export declaration kind: ' + declaration.getText());
          }

          const specifierAstModule: AstModule | undefined = this._fetchSpecifierAstModule(exportDeclaration);

          if (specifierAstModule !== undefined) {
            const exportedAstSymbol: AstSymbol | undefined = this._getExportOfAstModule(exportName, specifierAstModule);
            if (exportedAstSymbol !== undefined) {
              astModule.exportedSymbols.set(exportedSymbol.name, exportedAstSymbol);
              return;
            }
          }

        }
      }

      if (!(current.flags & ts.SymbolFlags.Alias)) { // tslint:disable-line:no-bitwise
        break;
      }

      const currentAlias: ts.Symbol = TypeScriptHelpers.getImmediateAliasedSymbol(current, this._typeChecker);
      // Stop if we reach the end of the chain
      if (!currentAlias || currentAlias === current) {
        break;
      }

      current = currentAlias;
    }

    // Otherwise, assume it is a normal declaration
    const fetchedAstSymbol: AstSymbol | undefined = this.fetchAstSymbol(current, true, undefined);
    if (fetchedAstSymbol !== undefined) {
      astModule.exportedSymbols.set(exportedSymbol.name, fetchedAstSymbol);
    }
  }

  private _getExportOfAstModule(exportName: string, astModule: AstModule): AstSymbol {
    const visitedAstModules: Set<AstModule> = new Set<AstModule>();
    const astSymbol: AstSymbol | undefined = this._tryGetExportOfAstModule(exportName, astModule, visitedAstModules);
    if (astSymbol === undefined) {
      throw new InternalError(`Unable to analyze the export ${JSON.stringify(exportName)}`);
    }
    return astSymbol;
  }

  private _tryGetExportOfAstModule(exportName: string, astModule: AstModule,
    visitedAstModules: Set<AstModule>): AstSymbol | undefined {

    if (visitedAstModules.has(astModule)) {
      return undefined;
    }
    visitedAstModules.add(astModule);

    let astSymbol: AstSymbol | undefined = astModule.exportedSymbols.get(exportName);
    if (astSymbol !== undefined) {
      return astSymbol;
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

  private _collectExportsFromExportStar(astModule: AstModule, exportStarDeclaration: ts.Declaration): void {
    if (ts.isExportDeclaration(exportStarDeclaration)) {

      const starExportedModule: AstModule | undefined = this._fetchSpecifierAstModule(exportStarDeclaration);
      if (starExportedModule !== undefined) {
        astModule.starExportedModules.add(starExportedModule);
      }

    } else {
      // Ignore ExportDeclaration nodes that don't match the expected pattern
      // TODO: Should we report a warning?
    }
  }

  private _fetchSpecifierAstModule(exportStarDeclaration: ts.ImportDeclaration | ts.ExportDeclaration): AstModule
    | undefined {

    // The name of the module, which could be like "./SomeLocalFile' or like 'external-package/entry/point'
    const moduleSpecifier: string | undefined = TypeScriptHelpers.getModuleSpecifier(exportStarDeclaration);
    if (!moduleSpecifier) {
      // TODO: Should we report a warning?
      return;
    }

    const resolvedModule: ts.ResolvedModuleFull | undefined = TypeScriptHelpers.getResolvedModule(
      exportStarDeclaration.getSourceFile(), moduleSpecifier);

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

    const specifierAstModule: AstModule = this.fetchAstModuleBySourceFile(moduleSourceFile, moduleSpecifier);
    return specifierAstModule;
  }
}
