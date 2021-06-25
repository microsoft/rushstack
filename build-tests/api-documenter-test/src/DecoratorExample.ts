function jsonSerialized(target: any, propertyKey: string) {}

function jsonFormat(value: string) {
  return function (target: Object, propertyKey: string) {};
}

/** @public */
export class DecoratorExample {
  /**
   * The date when the record was created.
   *
   * @remarks
   * Here is a longer description of the property.
   *
   * @decorator `@jsonSerialized`
   * @decorator `@jsonFormat('mm/dd/yy')`
   */
  @jsonSerialized
  @jsonFormat('mm/dd/yy')
  public creationDate: Date;
}
