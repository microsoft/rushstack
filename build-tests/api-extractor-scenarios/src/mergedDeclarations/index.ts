// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class MergedClassAndInterface {
  someProp: number;
  someMethod(x: string): void {}
}

/** @public */
export interface MergedClassAndInterface {
  anotherProp: boolean;
  someMethod(x: string | boolean): void;
}

/** @public */
export interface MergedInterfaces {
  someProp: number;
}

/** @public */
export interface MergedInterfaces {
  someProp: number;
}

/** @public */
export class MergedClassAndNamespace {
  someProp: number;
}

/** @public */
export namespace MergedClassAndNamespace {
  export let anotherProp: number;
}

/** @public */
export namespace MergedNamespaces {
  export class SomeClass {}
}

/** @public */
export namespace MergedNamespaces {
  export class AnotherClass {}
}
