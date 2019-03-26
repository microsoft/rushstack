
/** @public */
export declare class CyclicA {
    /** {@inheritDoc CyclicB.methodB2} */
    methodA1(): void;
    /** {@inheritDoc CyclicB.methodB4} */
    methodA3(): void;
}

/** @public */
export declare class CyclicB {
    /** {@inheritDoc CyclicA.methodA3} */
    methodB2(): void;
    /** THE COMMENT */
    methodB4(): void;
}

/** @public */
export declare class FailWithSelfReference {
    /** {@inheritDoc FailWithSelfReference.method2} */
    method1(): void;
    /** {@inheritDoc FailWithSelfReference.method1} */
    method2(): void;
}

export { }
