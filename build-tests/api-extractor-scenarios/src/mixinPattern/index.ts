// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

type Constructor = new (...args: any[]) => {};

function someMixin<Base extends Constructor>(base: Base) {
  return class extends base {
    mixinProp?: string;
  };
}

/** @public */
export class A {
  prop?: string;
}

/** @public */
export class B extends someMixin(A) {}
