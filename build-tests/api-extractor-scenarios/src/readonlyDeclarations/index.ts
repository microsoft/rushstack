// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export const READONLY_VARIABLE = 'Hello world!';

/**
 * @public
 * @readonly
 */
export let TSDOC_READONLY_VARIABLE: string;

/** @public */
export class MyClass {
  get _onlyGetter(): string {
    return 'Hello world!';
  }

  readonly readonlyModifier: string;

  /** @readonly */
  tsDocReadonly: string;
}

/** @public */
export interface MyInterface {
  get _onlyGetter(): string;

  readonly readonlyModifier: string;

  /** @readonly */
  set tsDocReadonly(value: string);

  readonly [x: number]: void;
}
