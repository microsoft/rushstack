// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An engine for generating TypeScript .d.ts files that provide type signatures
 * for non-TypeScript modules such as generated JavaScript or CSS. It can operate
 * in either a single-run mode or a watch mode.
 *
 * @packageDocumentation
 */

export { ITypingsGeneratorBaseOptions, ITypingsGeneratorOptions, TypingsGenerator } from './TypingsGenerator';

export {
  IStringValueTyping,
  IStringValueTypings,
  IStringValuesTypingsGeneratorOptions,
  StringValuesTypingsGenerator
} from './StringValuesTypingsGenerator';
