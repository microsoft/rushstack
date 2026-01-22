/** @public */
export declare function testArray([x, y]: [number, number], last: string): void;

/** @public */
export declare function testNameConflict([x, y]: [number, number], list: boolean): void;

/** @public */
export declare function testNameConflict2({ x }: {
    x: number;
}, { y }: {
    y: number;
}, anonymous2: string): void;

/** @public */
export declare function testObject(first: string, { x, y }: {
    x: number;
    y: number;
}): void;

/** @public */
export declare function testObjects({ x }: {
    x: number;
}, { y }: {
    y: number;
}): void;

/** @public */
export declare function testObjectWithComments({ x, // slash P3
    y }: {
    x: number;
    y: number;
}): void;

export { }
