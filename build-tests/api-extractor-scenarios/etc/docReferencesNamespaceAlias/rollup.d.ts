/** @public */
export declare class Item {
    options: Options;
}

/** @public */
declare interface Options {
    name: string;
    color: 'red' | 'blue';
    subOptions: SubOptions;
}

declare namespace renamed {
    export {
        sub,
        Options
    }
}
export { renamed }

declare namespace sub {
    export {
        SubOptions
    }
}

/** @public */
declare interface SubOptions {
    count: number;
}

export { }
