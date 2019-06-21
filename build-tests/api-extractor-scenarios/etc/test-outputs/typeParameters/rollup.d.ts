
/** @public */
export declare class ClassWithGenericMethod {
    method<T>(): void;
}

/** @public */
export declare class GenericClass<T> {
}

/** @public */
export declare class GenericClassWithConstraint<T extends string> {
}

/** @public */
export declare class GenericClassWithDefault<T = number> {
}

/** @public */
export declare function genericFunction<T>(): void;

/** @public */
export declare interface GenericInterface<T> {
}

/** @public */
export declare type GenericTypeAlias<T> = T;

/** @public */
export declare interface InterfaceWithGenericCallSignature {
    <T>(): void;
}

/** @public */
export declare interface InterfaceWithGenericConstructSignature {
    new <T>(): T;
}

export { }
