/**
 * api-extractor-test-04
 * 
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 * 
 * @packagedocumentation
 */


/* Excluded from this release type: AlphaClass */

/**
 * This is a beta class
 * @beta
 */
export declare class BetaClass implements BetaInterface {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /* Excluded from this release type: alphaMember */
    /* Excluded from this release type: _internalMember */
}

/**
 * This is a beta interface
 * @beta
 */
export declare interface BetaInterface {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /* Excluded from this release type: alphaMember */
    /* Excluded from this release type: _internalMember */
}

/**
 * This is a const enum marked as \@beta
 * @beta
 */
export declare const enum ConstEnum {
    /**
     * This member inherits its \@beta status from the parent
     */
    BetaMember2 = "BetaMember2",
    /* Excluded from this release type: AlphaMember */,
    /* Excluded from this release type: _InternalMember */,
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
        /* Excluded from this release type: ClassX */
    }
    /**
     * This is a nested namespace.
     * The "beta" release tag is inherited from the parent.
     */
    export declare namespace N3 {
        /* Excluded from this release type: _ClassY */
    }
}

/**
 * This is an exported type alias.
 */
export declare type ExportedAlias = AlphaClass;

/* Excluded from this release type: InternalClass */

/**
 * This is a public class
 * @public
 */
export declare class PublicClass {
    /**
     * This is a beta field
     * @beta
     */
    betaField: string;
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /**
     * This is a beta comment
     * @beta
     */
    betaMember(): void;
    /* Excluded from this release type: alphaMember */
    /* Excluded from this release type: _internalMember */
}

/**
 * This is a regular enum marked as \@beta
 * @beta
 */
export declare enum RegularEnum {
    /**
     * This member inherits its \@beta status from the parent
     */
    BetaMember = 100,
    /* Excluded from this release type: AlphaMember */,
    /* Excluded from this release type: _InternalMember */,
}

declare const variableDeclaration: string;
