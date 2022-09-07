declare namespace internal {
    export {
        internal2,
        SomeClass,
        SomeClass2
    }
}
export { internal }
export { internal as internalAlias }

declare namespace internal2 {
    export {
        SomeClass,
        SomeClass2
    }
}
export { internal2 }
export { internal2 as internal2Alias }
export { internal2 as internal2Alias2 }

/** @public */
declare class SomeClass {
}
export { SomeClass }
export { SomeClass as SomeClass2Alias }
export { SomeClass as SomeClassAlias }

/** @public */
export declare class SomeClass2 {
}

export { }
