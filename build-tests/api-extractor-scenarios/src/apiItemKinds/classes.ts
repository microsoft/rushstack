// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export abstract class AbstractClass {
  public abstract member(): void;
}

/** @public */
export class SimpleClass {
  public member(): void {}

  public optionalParamMethod(x?: number): void {}

  public get readonlyProperty(): string {
    return 'hello';
  }

  public get writeableProperty(): string {
    return 'hello';
  }
  public set writeableProperty(value: string) {}

  readonly someReadonlyProp = 5;
  readonly someReadonlyPropWithType: number = 5;
}
