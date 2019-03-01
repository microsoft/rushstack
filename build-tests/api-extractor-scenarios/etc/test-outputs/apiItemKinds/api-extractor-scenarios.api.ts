// @public (undocumented)
declare abstract class AbstractClass {
    // (undocumented)
    abstract member(): void;
}

// @public (undocumented)
declare class ClassWithTypeLiterals {
    method1(vector: {
        x: number;
        y: number;
    }): void;
    method2(): {
        classValue: ClassWithTypeLiterals;
        callback: () => number;
    } | undefined;
}

// @public (undocumented)
declare const enum ConstEnum {
    // (undocumented)
    One = 1,
    // (undocumented)
    Two = 2,
    // (undocumented)
    Zero = 0
}

// @public (undocumented)
interface IInterface {
    // (undocumented)
    member: string;
}

// @public (undocumented)
declare namespace NamespaceContainingVariable {
    let // (undocumented)
    variable: object[];
    let // (undocumented)
    constVariable: object[];
}

// @public (undocumented)
declare enum RegularEnum {
    One = 1,
    Two = 2,
    Zero = 0
}

// @public (undocumented)
declare class SimpleClass {
    // (undocumented)
    member(): void;
}

// @public (undocumented)
declare const VARIABLE: string;


// (No @packageDocumentation comment for this package)
