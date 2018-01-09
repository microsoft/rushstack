
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
     * Configured via tsconfig.json's "lib" setting, which specifies "@types/jest".
     * The emitted index.d.ts gets a reference like this:  <reference types="jest" />
     */
    definitelyTyped(): jest.Context;
    /**
     * Found via tsconfig.json's "include" setting point to a *.d.ts file.
     * This is an old-style Definitely Typed definition, which is the worst possible kind,
     * because consumers are expected to provide this, with no idea where it came from.
     */
    localTypings(): IAmbientInterfaceExample;
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
 * A simple, normal definition
 * @public
 */
export declare interface ISimpleInterface {
}

/**
 * This class gets aliased twice before being exported from the package.
 * @public
 */
export declare class ReexportedClass {
    getSelfReference(): ReexportedClass;
    getValue(): string;
}

/**
 * Example decorator
 * @public
 */
export declare function virtual(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): void;
