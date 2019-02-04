
/** @public */
export declare abstract class AbstractClass {
    abstract member(): void;
}

/** @public */
export declare class ClassWithTypeLiterals {
    /** type literal in  */
    method1(vector: {
        x: number;
        y: number;
    }): void;
    /** type literal output  */
    method2(): {
        classValue: ClassWithTypeLiterals;
        callback: () => number;
    } | undefined;
}

/** @public */
export declare const enum ConstEnum {
    Zero = 0,
    One = 1,
    Two = 2
}

/** @public */
export declare interface IInterface {
    member: string;
}

/** @public */
export declare namespace NamespaceContainingVariable {
    let variable: object[];
    let constVariable: object[];
}

/** @public */
export declare enum RegularEnum {
    /**
     * These are some docs for Zero
     */
    Zero = 0,
    /**
     * These are some docs for One
     */
    One = 1,
    /**
     * These are some docs for Two
     */
    Two = 2
}

/** @public */
export declare class SimpleClass {
    member(): void;
}

/** @public */
export declare const VARIABLE: string;

export { }
