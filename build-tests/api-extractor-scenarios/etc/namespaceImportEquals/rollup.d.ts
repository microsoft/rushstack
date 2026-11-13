/** @public */
export declare namespace Camera {
    export enum TransitionType {
        FLY = "fly",
        INSTANT = "instant"
    }
}

/** @public */
export declare namespace Sweep {
    /** Alias kept for backward compatibility. */
    export import Transition = Camera.TransitionType;
    export namespace Nested {
        export import Transition = Camera.TransitionType;
    }
}

export { }
