
/** @internal */
export declare interface _IInternalThing {
    title: string;
}

/** @public */
export declare class MyClass {
    /** @internal */
    get _thing(): _IInternalThing;
    set _thing(value: _IInternalThing);
}

export { }
