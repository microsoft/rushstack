import * as ts from 'typescript';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiParameter from './ApiParameter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import PrettyPrinter from '../PrettyPrinter';

/**
  * This class is part of the ApiItem abstract syntax tree. It represents functions that are directly
  * defined inside a package and are not member of classes, interfaces, or nested type literal expressions
  *
  * @see ApiMethod for functions that are members of classes, interfaces, or nested type literal expressions
  */
class ApiFunction extends ApiItem {
  public returnType: string;
  public params: ApiParameter[];

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Function;

    const methodDeclaration: ts.FunctionDeclaration = options.declaration as ts.FunctionDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(param);
        const apiParameter: ApiParameter = new ApiParameter({
          extractor: this.extractor,
          declaration: param,
          declarationSymbol: declarationSymbol,
          jsdocNode: param
        });

        if (apiParameter.hasIncompleteTypes) {
          this.hasIncompleteTypes = true;
        }
        this.params.push(apiParameter);
      }
    }

    // Return type
    if (methodDeclaration.type) {
      this.returnType = methodDeclaration.type.getText();
    } else {
      this.hasIncompleteTypes = true;
      this.returnType = 'any';
    }
  }

  /**
   * Returns a text string such as "someName?: SomeTypeName;", or in the case of a type
   * literal expression, returns a text string such as "someName?:".
   */
  public getDeclarationLine(): string {
    return PrettyPrinter.getDeclarationSummary(this.declaration);
  }
}

export default ApiFunction;
