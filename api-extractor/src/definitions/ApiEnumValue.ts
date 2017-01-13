import ApiItem, { IApiItemOptions } from './ApiItem';
import PrettyPrinter from '../PrettyPrinter';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents a TypeScript enum value.
 * The parent container will always be an ApiEnum instance.
 */
export default class ApiEnumValue extends ApiItem {
  constructor(options: IApiItemOptions) {
    super(options);
  }

  /**
   * Returns a text string such as "MyValue = 123,"
   */
  public getDeclarationLine(): string {
    return PrettyPrinter.getDeclarationSummary(this.declaration);
  }
}
