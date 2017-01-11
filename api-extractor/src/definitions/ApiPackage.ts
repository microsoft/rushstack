/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import Analyzer from '../Analyzer';
import ApiStructuredType from './ApiStructuredType';
import ApiEnum from './ApiEnum';
import ApiFunction from './ApiFunction';
import { IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';

/**
  * This class is part of the ApiItem abstract syntax tree.  It represents the top-level
  * exports for an Rush package.  This object acts as the root of the Analyzer's tree.
  */
export default class ApiPackage extends ApiItemContainer {
  constructor(analyzer: Analyzer, rootFileSymbol: ts.Symbol) {
    super({
      analyzer,
      declaration: rootFileSymbol.declarations[0],
      declarationSymbol: rootFileSymbol
    });

    const exportSymbols: ts.Symbol[] = this.typeChecker.getExportsOfModule(rootFileSymbol);
    if (exportSymbols) {
      for (const exportSymbol of exportSymbols) {
        const followedSymbol: ts.Symbol = this.followAliases(exportSymbol);

        if (!followedSymbol.declarations) {
          this.reportWarning(`Definition with no declarations: ${exportSymbol.name}`);
          continue;
        }

        for (const declaration of followedSymbol.declarations) {
          const options: IApiItemOptions = {
            analyzer: this.analyzer,
            declaration,
            declarationSymbol: followedSymbol,
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
      }
    }
  }

  public shouldHaveDocumentation(): boolean {
    // We don't write JSDoc for the ApiPackage object
    return false;
  }
}
