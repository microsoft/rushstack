/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import Extractor from '../Extractor';
import ApiStructuredType from './ApiStructuredType';
import ApiEnum from './ApiEnum';
import ApiFunction from './ApiFunction';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';
import TypeScriptHelpers from '../TypeScriptHelpers';
import PackageJsonHelpers from '../PackageJsonHelpers';

/**
 * An export name and the symbol from which the export was originally defined.
 * 
 * For example, suppose a class is defined as "export default class MyClass { }"
 * but exported from the package's index.ts like this:
 *
 *    export { default as _MyClass } from './MyClass';
 *
 * In this example, the exportedName is _MyClass and the followed symbol will be the
 * original definition of MyClass.
 */
interface IExportedSymbol {
  exportedName: string;
  followedSymbol: ts.Symbol;
}

/**
  * This class is part of the ApiItem abstract syntax tree.  It represents the top-level
  * exports for an Rush package.  This object acts as the root of the Extractor's tree.
  */
export default class ApiPackage extends ApiItemContainer {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  private static _getOptions(extractor: Extractor, rootFile: ts.SourceFile): IApiItemOptions {
    const rootFileSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(rootFile);
    let statement: ts.VariableStatement;
    let foundDescription: ts.Node = undefined;

    for (const statementNode of rootFile.statements) {
      if (statementNode.kind === ts.SyntaxKind.VariableStatement) {
        statement = statementNode as ts.VariableStatement;
        for (const statementDeclaration of statement.declarationList.declarations) {
          if (statementDeclaration.name.getText() === 'packageDescription') {
            foundDescription = statement;
          }
        }
      }
    }

    return {
      extractor,
      declaration: rootFileSymbol.declarations[0],
      declarationSymbol: rootFileSymbol,
      jsdocNode: foundDescription
    };
  }
  constructor(extractor: Extractor, rootFile: ts.SourceFile) {
    super(ApiPackage._getOptions(extractor, rootFile));
    this.kind = ApiItemKind.Package;
    // The scoped package name. (E.g. "@microsoft/api-extractor")
    this.name = PackageJsonHelpers.getPackageName(this.extractor.packageFolder);

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol);
    if (exportSymbols) {
      for (const exportSymbol of exportSymbols) {
        const followedSymbol: ts.Symbol = this.followAliases(exportSymbol);

        if (!followedSymbol.declarations) {
          this.reportWarning(`Definition with no declarations: ${exportSymbol.name}`);
          continue;
        }

        for (const declaration of followedSymbol.declarations) {
          const options: IApiItemOptions = {
            extractor: this.extractor,
            declaration,
            declarationSymbol: followedSymbol,
            jsdocNode: declaration,
            exportSymbol
          };

          if (followedSymbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
            this.addMemberItem(new ApiStructuredType(options));
          } else if (followedSymbol.flags & ts.SymbolFlags.Function) {
            this.addMemberItem(new ApiFunction(options));
          } else if (followedSymbol.flags & ts.SymbolFlags.Enum) {
            this.addMemberItem(new ApiEnum(options));
          } else {
            this.reportWarning(`Unsupported export: ${exportSymbol.name}`);
          }
        }
        this._exportedNormalizedSymbols.push({
          exportedName: exportSymbol.name,
          followedSymbol: followedSymbol
        });
      }
    }
  }

  /**
   * Finds and returns the original symbol name.
   * 
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, given the symbol for _MyClass, getExportedSymbolName() will return 
   * the string "MyClass".
   */
  public getExportedSymbolName(symbol: ts.Symbol): string {
    const followedSymbol: ts.Symbol = this.followAliases(symbol);
    for (const exportedSymbol of this._exportedNormalizedSymbols) {
      if (exportedSymbol.followedSymbol === followedSymbol) {
        return exportedSymbol.exportedName;
      }
    }
    return undefined;
  }

  /**
   * Find a member in this package by name and return it if found.
   * 
   * @param memberName - the name of the member ApiItem
   */
  public getMemberItem(memberName: string): ApiItem {
    if (this.memberItems.has(memberName)) {
      return this.memberItems.get(memberName);
    }
    return undefined;
  }

  public shouldHaveDocumentation(): boolean {
    // We don't write JSDoc for the ApiPackage object
    return false;
  }
}
