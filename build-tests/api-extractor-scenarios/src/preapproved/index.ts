// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @internal @preapproved */
export enum _PreapprovedEnum {
  ONE = 1,
  TWO
}

/** @internal @preapproved */
export interface _PreapprovedInterface {
  member(): void;
}

/** @internal @preapproved */
export class _PreapprovedClass {
  public member(): void {}
}

/** @internal @preapproved */
export namespace _PreapprovedNamespace {
  export class X {}

  export function f(): void {}
}
