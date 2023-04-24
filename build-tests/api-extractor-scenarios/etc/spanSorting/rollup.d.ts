/**
 * Doc comment
 * @public
 */
export declare class ExampleA {
    private _member3;
    member2(): Promise<void>;
    member1: string;
}

/**
 * Doc comment
 * @public
 */
export declare class ExampleB {
    /**
     * If the file exists, calls loadFromFile().
     */
    tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean;
    /**
     * Helper function that adds an already created ApprovedPackagesItem to the
     * list and set.
     */
    private _addItem;
}

/** @public */
export declare class ExampleC {
    /**
     * This comment is improperly formatted TSDoc.
     * Note that Prettier doesn't try to format it.
     @returns the return value
     @throws an exception
     */
    member1(): void;
}

/**
 * Outer description
 * @public
 */
export declare const exampleD: (o: {
    /**
     * Inner description
     */
    a: number;
    /**
     * @returns a string
     * {@link http://example.com}
     */
    b(): string;
}) => void;

export { }
