// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Some utilities for working with Rush Stack localization files.
 *
 * @packageDocumentation
 */

export type {
  ILocalizationFile,
  ILocalizedString,
  IPseudolocaleOptions,
  IParseFileOptions,
  IgnoreStringFunction
} from './interfaces.ts';
export { parseLocJson } from './parsers/parseLocJson.ts';
export { parseResJson } from './parsers/parseResJson.ts';
export { parseResx, type IParseResxOptions, type IParseResxOptionsBase } from './parsers/parseResx.ts';
export { parseLocFile, type IParseLocFileOptions, type ParserKind } from './LocFileParser.ts';
export {
  type ITypingsGeneratorOptions,
  type IInferInterfaceNameExportAsDefaultOptions,
  TypingsGenerator
} from './TypingsGenerator.ts';
export { getPseudolocalizer } from './Pseudolocalization.ts';
