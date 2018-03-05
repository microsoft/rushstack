/**
 * api-extractor-test-04
 * 
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 * 
 * @packagedocumentation
 */


/**
 * This is an alpha class.
 * @alpha
 */
export declare class AlphaClass {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
}

/**
 * This is a beta class
 * @beta
 */
export declare class BetaClass {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /**
     * This is an alpha comment
     * @alpha
     */
    alphaMember(): void;
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
}

/**
 * This is an internal class
 * @internal
 */
export declare class InternalClass {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
}

/**
 * This is a public class
 * @public
 */
export declare class PublicClass {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /**
     * This is a beta comment
     * @beta
     */
    betaMember(): void;
    /**
     * This is an alpha comment
     * @alpha
     */
    alphaMember(): void;
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
}
