declare namespace i1 {
    export {
        internal
    }
}
export { i1 }

declare namespace i2 {
    export {
        internal
    }
}
export { i2 }

declare namespace internal {
    export {
        SomeClass
    }
}

/** @public */
declare class SomeClass {
}

/** @public */
export declare function someFunction(): i1.internal.SomeClass;

export { }
