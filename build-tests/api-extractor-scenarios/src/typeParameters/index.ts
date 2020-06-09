// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class GenericClass<T> {}

/** @public */
export class GenericClassWithConstraint<T extends string> {}

/** @public */
export class GenericClassWithDefault<T = number> {}

/** @public */
export class ClassWithGenericMethod {
  public method<T>() {}
}

/** @public */
export interface GenericInterface<T> {}

/** @public */
export interface InterfaceWithGenericCallSignature {
  <T>(): void;
}

/** @public */
export interface InterfaceWithGenericConstructSignature {
  new <T>(): T;
}

/** @public */
export function genericFunction<T>(): void {}

/** @public */
export type GenericTypeAlias<T> = T;
