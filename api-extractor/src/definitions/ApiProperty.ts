import { IApiItemOptions } from './ApiItem';
import ApiMember from './ApiMember';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents properties of classes or interfaces
 * (It does not represent member methods)
 */
class ApiProperty extends ApiMember {
  public type: string;
  public isStatic: boolean;
  public isReadOnly: boolean;

  constructor(options: IApiItemOptions) {
    super(options);

    this.isReadOnly = this.documentation.readonly ? this.documentation.readonly : false;

    const declaration: any = options.declaration as any; /* tslint:disable-line:no-any */
    if (declaration && declaration.type) {
      this.type = declaration.type.getText();
    }
  }

  public getDeclarationLine(): string {
    return super.getDeclarationLine({
      type: this.type,
      readonly: this.isReadOnly
    });
  }
}

export default ApiProperty;
