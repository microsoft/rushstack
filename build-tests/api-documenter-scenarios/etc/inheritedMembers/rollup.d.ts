import { Extractor } from '@microsoft/api-extractor';

/** @public */
export declare class Class1 extends Class2<number> {
    /** A second prop. Overrides `Class2.secondProp`. */
    secondProp: boolean;
    /** A fourth prop */
    fourthProp: number;
    /** Some overload. Overrides `Class3.someOverload`. */
    someOverload(x: boolean | string): void;
}

/** @public */
export declare class Class2<T> extends Namespace1.Class3 {
    /** A second prop. */
    secondProp: boolean | string;
    /** A third prop. */
    thirdProp: T;
    /** Some method. Overrides `Class3.someMethod`. */
    someMethod(x: boolean): void;
}

/**
 * Some class-like variable.
 * @public
 */
export declare const ClassLikeVariable: {
    new (): {
        someProp: number;
    };
};

/**
 * Some class that extends an anonymous class.
 * @public
 */
export declare class ExtendsAnonymousClass extends ExtendsAnonymousClass_base {
}

declare const ExtendsAnonymousClass_base: {
    new (): {
        someProp: number;
    };
};

/**
 * Some class that extends a class from another package. This base class
 * is not in any API doc model.
 * @public
 */
export declare class ExtendsClassFromAnotherPackage extends Extractor {
}

/**
 * Some class that extends a class-like variable.
 * @public
 */
export declare class ExtendsClassLikeVariable extends ClassLikeVariable {
}

/**
 * Some class that extends an unexported class.
 * @public
 */
export declare class ExtendsUnexportedClass extends UnexportedClass {
}

/**
 * Some interface that extends an interface-like type alias as well as
 * another interface.
 * @public
 */
export declare interface IExtendsInterfaceLikeTypeAlias extends IInterfaceLikeTypeAlias, IInterface1 {
}

/**
 * Some interface that extends multiple interfaces.
 * @public
 */
export declare interface IExtendsMultipleInterfaces extends IInterface1, IInterface2 {
    /** A second prop. Overrides `IInterface1.someProp`. */
    secondProp: boolean;
    /** A third prop. */
    thirdProp: string;
}

/** @public */
export declare interface IInterface1 {
    /** Some prop. */
    someProp: number;
    /** A second prop. */
    secondProp: boolean | string;
}

/** @public */
export declare interface IInterface2 {
    /** Some prop. */
    someProp: number;
}

/**
 * Some interface-like type alias.
 * @public
 */
export declare type IInterfaceLikeTypeAlias = {
    someProp: number;
};

/** @public */
export declare namespace Namespace1 {
    /** @public */
    class Class3 {
        /** Some prop. */
        someProp: number;
        /** Some method. */
        someMethod(x: boolean | string): void;
        /** Some overload. */
        someOverload(x: boolean): void;
        /** Some overload. */
        someOverload(x: string): void;
    }
}

declare class UnexportedClass {
    someProp: number;
}

export { }
