// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export interface _IInternalThing {
  title: string;
}

/** @public */
export const FOO = 'foo';

/** @public */
export class MyClass {
  public get _writableThing(): _IInternalThing {
    return { title: 'thing' };
  }

  public set _writableThing(value: _IInternalThing) {}

  public get _onlyHasGetterThing(): _IInternalThing {
    return { title: 'thing' };
  }

  readonly declaredReadonlyThing: _IInternalThing;

  /**
   * Technically isn't but for testing purposes
   * @readonly
   */
  public tsDocReadonlyThing: _IInternalThing;
}
