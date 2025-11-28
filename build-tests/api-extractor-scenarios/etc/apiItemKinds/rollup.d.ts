/** @public */
export declare abstract class AbstractClass {
    abstract member(): void;
}

/** @public */
export declare class ClassWithTypeParameter<T> {
}

/** @public */
export declare const CONST_VARIABLE: string;

/** @public */
export declare const enum ConstEnum {
    Zero = 0,
    One = 1,
    Two = 2
}

/** @public */
export declare class ExtendsClassWithTypeParameter extends ClassWithTypeParameter<SimpleClass> {
}

/** @public */
export declare interface IInterface {
    member: string;
}

/** @public */
export declare namespace n1 {
    export class SomeClass1 {
    }
    export class SomeClass2 extends SomeClass1 {
    }
    export namespace n2 {
        export class SomeClass3 {
        }
    }
    export {};
}

/** @public */
export declare namespace n1 {
    export class SomeClass4 {
    }
}

/** @public */
export declare namespace n2 {
    const name2: SomeOtherType;
    export { SomeOtherType as SomeType, type SomeOtherType as YetAnotherType, type name2 };
}

/** @public */
export declare let nonConstVariable: string;

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
    optionalParamMethod(x?: number): void;
    get readonlyProperty(): string;
    get writeableProperty(): string;
    set writeableProperty(value: string);
    readonly someReadonlyProp = 5;
    readonly someReadonlyPropWithType: number;
}

/** @public */
export declare function someFunction(): void;

/** @public */
export declare type SomeOtherType = string;

/** @public */
export declare type SomeType = number;

/** @public */
export declare const VARIABLE_WITHOUT_EXPLICIT_TYPE = "hello";

export { }
