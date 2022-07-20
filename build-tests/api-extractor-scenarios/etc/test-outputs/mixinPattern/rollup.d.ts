/** @public */
export declare class A {
    prop?: string;
}

/** @public */
export declare class B extends B_base {
}

declare const B_base: {
    new (...args: any[]): {
        mixinProp?: string | undefined;
    };
} & typeof A;

export { }
