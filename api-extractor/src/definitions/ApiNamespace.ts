/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import ApiField from './ApiField';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';
import { IExportedSymbol } from '../IExportedSymbol';

const allowedTypes: string[] = ['string', 'number', 'boolean'];

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

        if (!(followedSymbol.flags === ts.SymbolFlags.BlockScopedVariable)) {
          this.reportWarning(`Unsupported export "${exportSymbol.name}" ` +
            'ApiNamespace only supports properties.');
          continue;
        }

        // Since we are imposing that the items within a namespace be
        // const properties we are only taking the first declaration.
        // If we decide to add support for other types within a namespace
        // we will have for evaluate each declaration.
        const declaration: ts.Declaration = followedSymbol.getDeclarations()[0];

        if (declaration.parent.flags !== ts.NodeFlags.Const) {
          this.reportWarning(`Export "${exportSymbol.name}" must possess the "const" modifier`);
          continue;
        }

        const propertySignature: ts.PropertySignature = declaration as ts.PropertySignature;
        const type: string = propertySignature.type.getText();
        if (allowedTypes.indexOf(type) < 0) {
          this.reportWarning(`Export "${exportSymbol.name}" must of type "string", "number" or "boolean"`);
          continue;
        }

        const exportMemberOptions: IApiItemOptions = {
          extractor: this.extractor,
          declaration,
          declarationSymbol: followedSymbol,
          jsdocNode: declaration,
          exportSymbol
        };

        this.addMemberItem(new ApiField(exportMemberOptions));

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
