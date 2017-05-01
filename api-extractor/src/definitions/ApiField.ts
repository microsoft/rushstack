import * as ts from 'typescript';
import { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiMember from './ApiMember';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents fields of
 * an ApiNamespace.
 */
class ApiField extends ApiMember {
  public type: string;
  public name: string;
  public value: string;

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Field;

    const propertySignature: ts.PropertySignature = options.declaration as ts.PropertySignature;
    this.type = propertySignature.type.getText();
    this.name = propertySignature.name.getText();
    this.value = propertySignature.initializer.getText(); // value of the export
  }
}

export default ApiField;
