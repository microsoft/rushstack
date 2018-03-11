/**
 * api-extractor-test-04
 * 
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 * 
 * @packagedocumentation
 */


// Removed for this release type: AlphaClass

// Removed for this release type: BetaClass

// Removed for this release type: EntangledNamespace

// Removed for this release type: InternalClass

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
