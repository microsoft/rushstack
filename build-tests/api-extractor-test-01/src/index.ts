// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

/**
 * A simple, normal definition
 * @public
 */
export interface ISimpleInterface {}

/**
 * Test different kinds of ambient definitions
 * @public
 */
export class AmbientConsumer {
  /**
   * Found via tsconfig.json's "lib" setting, which specifies the built-in "es2015.collection"
   */
  public builtinDefinition1(): Map<string, string> {
    return new Map<string, string>();
  }

  /**
   * Found via tsconfig.json's "lib" setting, which specifies the built-in "es2015.promise"
   */
  public builtinDefinition2(): Promise<void> {
    return new Promise<void>(() => {
      /* */
    });
  }

  /**
   * Configured via tsconfig.json's "lib" setting, which specifies `@types/jest`.
   * The emitted index.d.ts gets a reference like this:  <reference types="jest" />
   */
  public definitelyTyped(): jest.MockContext<number, any> {
    return {} as jest.MockContext<number, any>;
  }

  /**
   * Found via tsconfig.json's "include" setting point to a *.d.ts file.
   * This is an old-style Definitely Typed definition, which is the worst possible kind,
   * because consumers are expected to provide this, with no idea where it came from.
   */
  public localTypings(): IAmbientInterfaceExample {
    return {} as IAmbientInterfaceExample;
  }
}

/**
 * Example decorator
 * @public
 */
export function virtual(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<any>
): void {
  // Eventually we may implement runtime validation (e.g. in DEBUG builds)
  // but currently this decorator is only used by the build tools.
}

/**
 * Tests a decorator
 * @public
 */
export class DecoratorTest {
  /**
   * Function with a decorator
   */
  @virtual
  public test(): void {
    console.log('');
  }
}

export { default as AbstractClass } from './AbstractClass.ts';
export { default as AbstractClass2, AbstractClass3 } from './AbstractClass2.ts';

export { ClassWithAccessModifiers } from './AccessModifiers.ts';

export { ClassWithTypeLiterals } from './ClassWithTypeLiterals.ts';

export * from './DeclarationMerging.ts';

export * from './Enums.ts';

export { DefaultExportEdgeCase, default as ClassExportedAsDefault } from './DefaultExportEdgeCase.ts';

/**
 * Test that we can correctly carry default imports into the rollup .d.ts file
 */
import Long, { MAX_UNSIGNED_VALUE } from 'long';
export { MAX_UNSIGNED_VALUE };
/** @public */
export declare class UseLong {
  use_long(): Long;
}

export { ClassWithSymbols, fullyExportedCustomSymbol } from './EcmaScriptSymbols.ts';

export { ForgottenExportConsumer1 } from './ForgottenExportConsumer1.ts';
export { ForgottenExportConsumer2 } from './ForgottenExportConsumer2.ts';
export { ForgottenExportConsumer3 } from './ForgottenExportConsumer3.ts';

export type { default as IInterfaceAsDefaultExport } from './IInterfaceAsDefaultExport.ts';

/**
 * Test the alias-following logic:  This class gets aliased twice before being
 * exported from the package.
 */
export { ReexportedClass3 as ReexportedClass } from './ReexportedClass3/ReexportedClass3.ts';

export { TypeReferencesInAedoc } from './TypeReferencesInAedoc.ts';
export { ReferenceLibDirective } from './ReferenceLibDirective.ts';

export { VARIABLE, NamespaceContainingVariable } from './variableDeclarations.ts';
