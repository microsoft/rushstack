/** @public */
export declare class ClassWithTypeLiterals {
    /** type literal in  */
    method1(vector: {
        x: number;
        y: number;
    }): void;
    /** type literal output  */
    method2(): undefined | {
        classValue: ClassWithTypeLiterals;
        callback: () => number;
    };
}

export { }
