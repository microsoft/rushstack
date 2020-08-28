/**
 * api-extractor-test-01
 *
 * @remarks
 * This library is consumed by api-extractor-test-02 and api-extractor-test-03.
 * It tests the basic types of definitions, and all the weird cases for following
 * chains of type aliases.
 *
 * @packageDocumentation
 */

/// <reference types="jest" />
/// <reference lib="es2015.symbol.wellknown" />
/// <reference lib="es2018.intl" />
import { default as Long_2 } from 'long';
import { MAX_UNSIGNED_VALUE } from 'long';

/**
 * Example of an abstract class that is directly exported.
 * @public
 */
export declare abstract class AbstractClass {
    abstract test(): void;
}

/**
 * Example of an abstract class that is exported separately from its
 * definition.
 *
 * @public
 */
export declare abstract class AbstractClass2 {
    abstract test2(): void;
}

/**
 * Example of an abstract class that is not the default export
 *
 * @public
 */
export declare abstract class AbstractClass3 {
    abstract test3(): void;
}

/**
 * Test different kinds of ambient definitions
 * @public
 */
export declare class AmbientConsumer {
    /**
     * Found via tsconfig.json's "lib" setting, which specifies the built-in "es2015.collection"
     */
    builtinDefinition1(): Map<string, string>;
    /**
     * Found via tsconfig.json's "lib" setting, which specifies the built-in "es2015.promise"
     */
    builtinDefinition2(): Promise<void>;
    /**
     * Configured via tsconfig.json's "lib" setting, which specifies `@types/jest`.
     * The emitted index.d.ts gets a reference like this:  <reference types="jest" />
     */
    definitelyTyped(): jest.MockContext<number, any>;
    /**
     * Found via tsconfig.json's "include" setting point to a *.d.ts file.
     * This is an old-style Definitely Typed definition, which is the worst possible kind,
     * because consumers are expected to provide this, with no idea where it came from.
     */
    localTypings(): IAmbientInterfaceExample;
}

/** @public */
declare namespace ANamespace {
    const locallyExportedCustomSymbol: unique symbol;
    /** @public */
    const fullyExportedCustomSymbol: unique symbol;
}

/**
 * Referenced by DefaultExportEdgeCaseReferencer.
 * @public
 */
export declare class ClassExportedAsDefault {
}

/**
 * This class gets aliased twice before being exported from the package.
 * @public
 */
export declare class ClassWithAccessModifiers {
    /** Doc comment */
    private _privateField;
    /** Doc comment */
    private privateMethod;
    /** Doc comment */
    private get privateGetter();
    /** Doc comment */
    private privateSetter;
    /** Doc comment */
    private constructor();
    /** Doc comment */
    private static privateStaticMethod;
    /** Doc comment */
    protected protectedField: number;
    /** Doc comment */
    protected get protectedGetter(): string;
    /** Doc comment */
    protected protectedSetter(x: string): void;
    /** Doc comment */
    static publicStaticField: number;
    /** Doc comment */
    defaultPublicMethod(): void;
}

/**
 * @public
 */
export declare class ClassWithSymbols {
    readonly [unexportedCustomSymbol]: number;
    get [locallyExportedCustomSymbol](): string;
    [fullyExportedCustomSymbol](): void;
    get [ANamespace.locallyExportedCustomSymbol](): string;
    [ANamespace.fullyExportedCustomSymbol](): void;
    get [Symbol.toStringTag](): string;
}

/**
 * This class illustrates some cases involving type literals.
 * @public
 */
export declare class ClassWithTypeLiterals {
    /** type literal in  */
    method1(vector: {
        x: number;
        y: number;
    }): void;
    /** type literal output  */
    method2(): {
        classValue: ClassWithTypeLiterals;
        callback: () => number;
    } | undefined;
}

/**
 * @public
 */
export declare const enum ConstEnum {
    Zero = 0,
    One = 1,
    Two = 2
}

/**
 * Tests a decorator
 * @public
 */
export declare class DecoratorTest {
    /**
     * Function with a decorator
     */
    test(): void;
}

/**
 * @public
 */
export declare class DefaultExportEdgeCase {
    /**
     * This reference is encountered before the definition of DefaultExportEdgeCase.
     * The symbol.name will be "default" in this situation.
     */
    reference: ClassExportedAsDefault;
}

/** @public */
export declare class ForgottenExportConsumer1 {
    test1(): IForgottenExport | undefined;
}

/** @public */
export declare class ForgottenExportConsumer2 {
    test2(): IForgottenExport_2 | undefined;
}

/**
 * This class directly consumes IForgottenDirectDependency
 * and indirectly consumes IForgottenIndirectDependency.
 * @beta
 */
export declare class ForgottenExportConsumer3 {
    test2(): IForgottenDirectDependency | undefined;
}

/** @public */
export declare const fullyExportedCustomSymbol: unique symbol;

/**
 * This class is directly consumed by ForgottenExportConsumer3.
 */
declare interface IForgottenDirectDependency {
    member: IForgottenIndirectDependency;
}

/**
 * The ForgottenExportConsumer1 class relies on this IForgottenExport.
 *
 * This should end up as a non-exported "IForgottenExport" in the index.d.ts.
 */
declare interface IForgottenExport {
    instance1: string;
}

/**
 * The ForgottenExportConsumer2 class relies on this IForgottenExport.
 *
 * This should end up as a non-exported "IForgottenExport_2" in the index.d.ts.
 * It is renamed to avoid a conflict with the IForgottenExport from ForgottenExportConsumer1.
 */
declare interface IForgottenExport_2 {
    instance2: string;
}

/**
 * This class is indirectly consumed by ForgottenExportConsumer3.
 */
declare interface IForgottenIndirectDependency {
}

/**
 * This interface is exported as the default export for its source file.
 * @public
 */
export declare interface IInterfaceAsDefaultExport {
    /**
     * A member of the interface
     */
    member: string;
}

/**
 * IMergedInterface instance 1.
 * @alpha
 */
export declare interface IMergedInterface {
    type: string;
    reference: IMergedInterfaceReferencee;
}

/**
 * IMergedInterface instance 2.
 * @alpha
 */
export declare interface IMergedInterface {
    type: string;
    reference: IMergedInterfaceReferencee;
}

/**
 * @alpha
 */
export declare interface IMergedInterfaceReferencee {
}

/**
 * A simple, normal definition
 * @public
 */
export declare interface ISimpleInterface {
}

declare const locallyExportedCustomSymbol: unique symbol;
export { MAX_UNSIGNED_VALUE }

/** @public */
export declare namespace NamespaceContainingVariable {
    /** @internal */
    let variable: object[];
}

/**
 * This class gets aliased twice before being exported from the package.
 * @public
 */
export declare class ReexportedClass {
    getSelfReference(): ReexportedClass;
    getValue(): string;
}

/** @public */
export declare class ReferenceLibDirective extends Intl.PluralRules {
}

/**
 * @public
 */
export declare enum RegularEnum {
    /**
     * These are some docs for Zero
     */
    Zero = 0,
    /**
     * These are some docs for One
     */
    One = 1,
    /**
     * These are some docs for Two
     */
    Two = 2
}

/**
 * This class has links such as {@link TypeReferencesInAedoc}.
 * @public
 */
export declare class TypeReferencesInAedoc {
    /**
     * Returns a value
     * @param arg1 - The input parameter of type {@link TypeReferencesInAedoc}.
     * @returns An object of type {@link TypeReferencesInAedoc}.
     */
    getValue(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
    /** {@inheritDoc api-extractor-test-01#TypeReferencesInAedoc.getValue} */
    getValue2(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
    /**
     * @param arg - Malformed param reference.
     */
    getValue3(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
}

declare const unexportedCustomSymbol: unique symbol;

/** @public */
export declare class UseLong {
    use_long(): Long_2;
}

/** @alpha */
export declare const VARIABLE: string;

/**
 * Example decorator
 * @public
 */
export declare function virtual(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): void;

export { }
