// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
function jsonSerialized(target: any, propertyKey: string) {}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function jsonFormat(value: string) {
  return function (target: object, propertyKey: string) {};
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
