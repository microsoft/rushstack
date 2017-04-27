/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import ApiStructuredType from './ApiStructuredType';
import ApiEnum from './ApiEnum';
import ApiFunction from './ApiFunction';
import ApiProperty from './ApiProperty';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';
import { IExportedSymbol } from '../IExportedSymbol';

/**
  * This class is part of the ApiItem abstract syntax tree. It represents exports of
  * a namespace, the exports can be classes, interfaces, type literals, enums, functions,
  * and properties.
  */
export default class ApiNamespace extends ApiItemContainer {
  private _exportedNormalizedSymbols: IExportedSymbol[] = [];

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Namespace;
    this.name = options.declarationSymbol.name;

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(this.declarationSymbol);
    if (exportSymbols) {
      for (const exportSymbol of exportSymbols) {
        const followedSymbol: ts.Symbol = this.followAliases(exportSymbol);

        if (!followedSymbol.declarations) {
          this.reportWarning(`Definition with no declarations: ${exportSymbol.name}`);
          continue;
        }

        for (const declaration of followedSymbol.declarations) {
          const exportMemberOptions: IApiItemOptions = {
            extractor: this.extractor,
            declaration,
            declarationSymbol: followedSymbol,
            jsdocNode: declaration,
            exportSymbol
          };

          if (followedSymbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
            this.addMemberItem(new ApiStructuredType(exportMemberOptions));
          } else if (followedSymbol.flags & ts.SymbolFlags.Function) {
            this.addMemberItem(new ApiFunction(exportMemberOptions));
          } else if (followedSymbol.flags & ts.SymbolFlags.Enum) {
            this.addMemberItem(new ApiEnum(exportMemberOptions));
          } else if (followedSymbol.flags & ts.SymbolFlags.BlockScopedVariable) {
            this.addMemberItem(new ApiProperty(exportMemberOptions));
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
  public tryGetExportedSymbolName(symbol: ts.Symbol): string {
    const followedSymbol: ts.Symbol = this.followAliases(symbol);
    for (const exportedSymbol of this._exportedNormalizedSymbols) {
      if (exportedSymbol.followedSymbol === followedSymbol) {
        return exportedSymbol.exportedName;
      }
    }
    return undefined;
  }

  /**
   * Find a member in this namespace by name and return it if found.
   *
   * @param memberName - the name of the exported ApiItem
   */
  public getMemberItem(memberName: string): ApiItem {
    if (this.memberItems.has(memberName)) {
      return this.memberItems.get(memberName);
    }
    return undefined;
  }
}
