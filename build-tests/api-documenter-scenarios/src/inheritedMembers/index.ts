import { Extractor } from '@microsoft/api-extractor';

/** @public */
export namespace Namespace1 {
  /** @public */
  export class Class3 {
    /** Some prop. */
    someProp: number;

    /** Some method. */
    someMethod(x: boolean | string): void {}

    /** Some overload. */
    someOverload(x: boolean): void;

    /** Some overload. */
    someOverload(x: string): void;

    someOverload(x: boolean | string): void {}
  }
}

/** @public */
export class Class2<T> extends Namespace1.Class3 {
  /** A second prop. */
  secondProp: boolean | string;

  /** A third prop. */
  thirdProp: T;

  /** Some method. Overrides `Class3.someMethod`. */
  someMethod(x: boolean): void {}
}

/** @public */
export class Class1 extends Class2<number> {
  /** A second prop. Overrides `Class2.secondProp`. */
  secondProp: boolean;

  /** A fourth prop */
  fourthProp: number;

  /** Some overload. Overrides `Class3.someOverload`. */
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
  someProp: number;
} {}

/**
 * Some class-like variable.
 * @public
 */
export const ClassLikeVariable = class {
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
