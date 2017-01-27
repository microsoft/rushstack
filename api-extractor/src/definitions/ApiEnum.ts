import * as ts from 'typescript';
import ApiItemContainer from './ApiItemContainer';
import { IApiItemOptions } from './ApiItem';
import ApiEnumValue from './ApiEnumValue';
import TypeScriptHelpers from '../TypeScriptHelpers';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents a TypeScript enum definition.
 * The individual enum values are represented using ApiEnumValue.
 */
export default class ApiEnum extends ApiItemContainer {
  constructor(options: IApiItemOptions) {
    super(options);
    for (const memberDeclaration of (options.declaration as ts.EnumDeclaration).members) {
      const memberSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(memberDeclaration);

      const memberOptions: IApiItemOptions = {
        extractor: this.extractor,
        declaration: memberDeclaration,
        declarationSymbol: memberSymbol,
        jsdocNode: memberDeclaration
      };

      this.addMemberItem(new ApiEnumValue(memberOptions));
    }

  }
}
