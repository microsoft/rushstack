/** @public */
export declare class MergedClassAndInterface {
    someProp: number;
}

/** @public */
export declare interface MergedClassAndInterface {
    anotherProp: boolean;
    someMethod(x: string | boolean): void;
}

/** @public */
export declare class MergedClassAndNamespace {
    someProp: number;
}

/** @public */
export declare namespace MergedClassAndNamespace {
    let anotherProp: number;
}

/** @public */
export declare interface MergedInterfaces {
    someProp: number;
}

/** @public */
export declare interface MergedInterfaces {
    someProp: number;
}

/** @public */
export declare namespace MergedNamespaces {
    export class SomeClass {
    }
}

/** @public */
export declare namespace MergedNamespaces {
    export class AnotherClass {
    }
}

export { }
