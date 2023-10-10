// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class Foo {
  private _bar: string = 'bar';
  public baz: string = this._bar;
}
