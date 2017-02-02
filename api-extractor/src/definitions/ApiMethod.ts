import * as ts from 'typescript';
import { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiMember from './ApiMember';
import ApiParameter from './ApiParameter';
import TypeScriptHelpers from '../TypeScriptHelpers';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents functions that are members of
 * classes, interfaces, or nested type literal expressions. Unlike ApiFunctions, ApiMethods can have
 * access modifiers (public, private, etc.) or be optional, because they are members of a structured type
 *
 * @see ApiFunction for functions that are defined inside of a package
 */
export default class ApiMethod extends ApiMember {
  public returnType: string;
  public params: ApiParameter[];

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Method;

    const methodDeclaration: ts.MethodDeclaration = options.declaration as ts.MethodDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(param);
        this.params.push(new ApiParameter({
          extractor: this.extractor,
          declaration: param,
          declarationSymbol: declarationSymbol,
          jsdocNode: param
        }));
      }
    }

    this.returnType = methodDeclaration.type ? methodDeclaration.type.getText() : '';
  }
}
