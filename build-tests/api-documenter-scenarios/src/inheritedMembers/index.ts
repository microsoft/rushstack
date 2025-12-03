// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Extractor } from '@microsoft/api-extractor';

/** @public */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Namespace1 {
  /** @public */
  export class Class3 {
    /** Some prop. */
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    someProp: number;

    /** Some method. */
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    someMethod(x: boolean | string): void {}

    /** Some overload. */
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    someOverload(x: boolean): void;

    /** Some overload. */
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    someOverload(x: string): void;

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    someOverload(x: boolean | string): void {}
  }
}

/** @public */
export class Class2<T> extends Namespace1.Class3 {
  /** A second prop. */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  secondProp: boolean | string;

  /** A third prop. */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  thirdProp: T;

  /** Some method. Overrides `Class3.someMethod`. */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  someMethod(x: boolean): void {}
}

/** @public */
export class Class1 extends Class2<number> {
  /** A second prop. Overrides `Class2.secondProp`. */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  secondProp: boolean;

  /** A fourth prop */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  fourthProp: number;

  /** Some overload. Overrides `Class3.someOverload`. */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  someOverload(x: boolean | string): void {}
}

/** @public */
export interface IInterface1 {
  /** Some prop. */
  someProp: number;

  /** A second prop. */
  secondProp: boolean | string;
}

/** @public */
export interface IInterface2 {
  /** Some prop. */
  someProp: number;
}

/**
 * Some interface that extends multiple interfaces.
 * @public
 */
export interface IExtendsMultipleInterfaces extends IInterface1, IInterface2 {
  /** A second prop. Overrides `IInterface1.someProp`. */
  secondProp: boolean;

  /** A third prop. */
  thirdProp: string;
}

class UnexportedClass {
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  someProp: number;
}

/**
 * Some class that extends an unexported class.
 * @public
 */
export class ExtendsUnexportedClass extends UnexportedClass {}

/**
 * Some class that extends an anonymous class.
 * @public
 */
export class ExtendsAnonymousClass extends class {
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  someProp: number;
} {}

/**
 * Some class-like variable.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/typedef
export const ClassLikeVariable = class {
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  someProp: number;
};

/**
 * Some class that extends a class-like variable.
 * @public
 */
export class ExtendsClassLikeVariable extends ClassLikeVariable {}

/**
 * Some interface-like type alias.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IInterfaceLikeTypeAlias = {
  someProp: number;
};

/**
 * Some interface that extends an interface-like type alias as well as
 * another interface.
 * @public
 */
export interface IExtendsInterfaceLikeTypeAlias extends IInterfaceLikeTypeAlias, IInterface1 {}

/**
 * Some class that extends a class from another package. This base class
 * is not in any API doc model.
 * @public
 */
export class ExtendsClassFromAnotherPackage extends Extractor {}
