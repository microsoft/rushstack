// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-test-04
 *
 * Test scenarios for trimming alpha/beta/internal definitions from the generated *.d.ts files.
 *
 * @packageDocumentation
 */

export { AlphaClass } from './AlphaClass';
export { BetaClass } from './BetaClass';
export { PublicClass, type IPublicClassInternalParameters } from './PublicClass';
export { InternalClass } from './InternalClass';
export { EntangledNamespace } from './EntangledNamespace';

export * from './EnumExamples';

export type { BetaInterface } from './BetaInterface';

/**
 * This is a module-scoped variable.
 * @beta
 */
export const variableDeclaration: string = 'hello';

import { AlphaClass } from './AlphaClass';

/**
 * This is an exported type alias.
 * @alpha
 */
export type ExportedAlias = AlphaClass;

export type { IPublicComplexInterface } from './IPublicComplexInterface';

export type { Lib1Interface } from 'api-extractor-lib1-test';
