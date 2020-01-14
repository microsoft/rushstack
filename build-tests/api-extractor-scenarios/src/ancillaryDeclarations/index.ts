// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @internal */
export interface _IInternalThing {
  title: string;
}

/** @public */
export class MyClass {
  /** @internal */
  public get _thing(): _IInternalThing {
    return { title: 'thing' };
  }
  // The setter should also be considered @internal because the getter was marked as internal.
  public set _thing(value: _IInternalThing) {
  }
}
