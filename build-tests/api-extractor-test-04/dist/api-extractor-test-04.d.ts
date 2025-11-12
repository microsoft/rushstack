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
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
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
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
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
    /**
     * This member is marked as \@internal
     * @internal
     */
    _InternalMember = "_InternalMember"
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
        /**
         * This class is in a nested namespace.
         * @internal
         */
        class _ClassY {
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

/**
 * This is an exported type alias.
 * @alpha
 */
export declare type ExportedAlias = AlphaClass;

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
 * These are internal constructor parameters for PublicClass's internal constructor.
 * @internal
 */
export declare interface IPublicClassInternalParameters {
}

/**
 * This is a public class
 * @public
 */
export declare interface IPublicComplexInterface {
    /**
     * Example of trimming an indexer.
     * @internal
     */
    [key: string]: IPublicClassInternalParameters;
    /**
     * Example of trimming a construct signature.
     * @internal
     */
    new (): any;
}

export { Lib1Interface }

/**
 * This is a public class
 * @public
 */
export declare class PublicClass {
    /** @internal */
    constructor(parameters: IPublicClassInternalParameters);
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
    /**
     * This is an internal member
     * @internal
     */
    _internalMember(): void;
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
    /**
     * This member is marked as \@internal
     * @internal
     */
    _InternalMember = 102
}

/**
 * This is a module-scoped variable.
 * @beta
 */
export declare const variableDeclaration: string;

export { }
