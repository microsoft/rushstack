// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-test-04
 *
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 *
 * @packageDocumentation
 */

export { AlphaClass } from './AlphaClass.ts';
export { BetaClass } from './BetaClass.ts';
export { PublicClass, type IPublicClassInternalParameters } from './PublicClass.ts';
export { InternalClass } from './InternalClass.ts';
export { EntangledNamespace } from './EntangledNamespace.ts';

export * from './EnumExamples.ts';

export type { BetaInterface } from './BetaInterface.ts';

/**
 * This is a module-scoped variable.
 * @beta
 */
export const variableDeclaration: string = 'hello';

import { AlphaClass } from './AlphaClass.ts';

/**
 * This is an exported type alias.
 * @alpha
 */
export type ExportedAlias = AlphaClass;

export type { IPublicComplexInterface } from './IPublicComplexInterface.ts';

export type { Lib1Interface } from 'api-extractor-lib1-test';
