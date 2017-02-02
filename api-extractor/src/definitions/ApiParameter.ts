import * as ts from 'typescript';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents parameters of a function declaration
 */
class ApiParameter extends ApiItem {
  public isOptional: boolean;
  public type: string;

  /**
   * If there is a spread operator before the parameter declaration
   * Example: foo(...params: string[])
   */
  public isSpread: boolean;

  constructor(options: IApiItemOptions, docComment?: string) {
    super(options);
    this.kind = ApiItemKind.Parameter;

    const parameterDeclaration: ts.ParameterDeclaration = options.declaration as ts.ParameterDeclaration;
    this.isOptional = !!parameterDeclaration.questionToken || !!parameterDeclaration.initializer;
    this.type = parameterDeclaration.type.getText();
    this.isSpread = !!parameterDeclaration.dotDotDotToken;
  }
}

export default ApiParameter;
