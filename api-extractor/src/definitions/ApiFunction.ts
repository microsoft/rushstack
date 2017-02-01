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
        const docComment: string = declarationSymbol && this.documentation && this.documentation.paramDocs ?
          this.documentation.paramDocs.get(declarationSymbol.name) : '';
        this.params.push(new ApiParameter({
          extractor: this.extractor,
          declaration: param,
          declarationSymbol: declarationSymbol,
          jsdocNode: param
        }, docComment));
      }
    }

    this.returnType = methodDeclaration.type ? methodDeclaration.type.getText() : '';
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
