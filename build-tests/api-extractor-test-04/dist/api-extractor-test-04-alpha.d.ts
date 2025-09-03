/**
 * api-extractor-test-04
 *
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 *
 * @packageDocumentation
 */

import { Lib1Interface } from 'api-extractor-lib1-test';

/**
 * This is an alpha class.
 * @alpha
 */
export declare class AlphaClass {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /* Excluded from this release type: _internalMember */
}

/**
 * This is a beta class
 * @beta
 */
export declare class BetaClass implements BetaInterface {
    /**
     * This is a comment
     */
    undecoratedMember(): void;
    /**
     * This is an alpha comment
     * @alpha
     */
    alphaMember(): void;
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
    /**
     * This is an alpha comment
     * @alpha
     */
    alphaMember(): void;
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
    /**
     * This member is marked as \@alpha
     * @alpha
     */
    AlphaMember = "AlphaMember",
    /* Excluded from this release type: _InternalMember */
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
    namespace N2 {
        /**
         * This class is in a nested namespace.
         * @alpha
         */
        class ClassX {
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
    namespace N3 {
        /* Excluded from this release type: _ClassY */
    }
}

/**
 * This is an exported type alias.
 * @alpha
 */
export declare type ExportedAlias = AlphaClass;

/* Excluded from this release type: InternalClass */

/* Excluded from this release type: IPublicClassInternalParameters */

/**
 * This is a public class
 * @public
 */
export declare interface IPublicComplexInterface {
    /* Excluded from this release type: __index */
    /* Excluded from this release type: __new */
}

export { Lib1Interface }

/**
 * This is a public class
 * @public
 */
export declare class PublicClass {
    /* Excluded from this release type: __constructor */
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
    /**
     * This is an alpha comment
     * @alpha
     */
    alphaMember(): void;
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
    /**
     * This member is marked as \@alpha
     * @alpha
     */
    AlphaMember = 101,
    /* Excluded from this release type: _InternalMember */
}

/**
 * This is a module-scoped variable.
 * @beta
 */
export declare const variableDeclaration: string;

export { }
