/**
 * api-extractor-test-04
 * 
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 * 
 * @packagedocumentation
 */


// Removed for this release type: AlphaClass

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
 * This is a "beta" namespace.
 * @beta
 */
export declare namespace EntangledNamespace {
    /**
     * This is a nested namespace.
     * The "beta" release tag is inherited from the parent.
     */
    export declare namespace N2 {
        /**
         * This class is in a nested namespace.
         * @alpha
         */
        export declare class ClassX {
            /**
             * The "alpha" release tag is inherited from the parent.
             */
            static a: string;
        }
    }
    /**
     * This is a nested namespace.
     * The "beta" release tag is inherited from the parent.
     */
    export declare namespace N3 {
        /**
         * This class is in a nested namespace.
         * @internal
         */
        export declare class _ClassY {
            /**
             * This definition refers to a "alpha" namespaced class.
             */
            b: EntangledNamespace.N2.ClassX;
            /**
             * This definition refers to the type of a "alpha" namespaced member.
             */
            c(): typeof N2.ClassX.a;
        }
    }
}

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
