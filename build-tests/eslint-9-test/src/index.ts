// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class Foo {
  // eslint-disable-next-line @typescript-eslint/typedef
  #bar = 'bar';
  public baz: string = this.#bar;
}

export const Bad_Name: string = '37';
