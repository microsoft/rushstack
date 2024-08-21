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
} from './interfaces';
export { parseLocJson } from './parsers/parseLocJson';
export { parseResJson } from './parsers/parseResJson';
export { parseResx, type IParseResxOptions, type IParseResxOptionsBase } from './parsers/parseResx';
export { parseLocFile, type IParseLocFileOptions, type ParserKind } from './LocFileParser';
export {
  type ITypingsGeneratorOptions,
  type IInferInterfaceNameExportAsDefaultOptions,
  TypingsGenerator
} from './TypingsGenerator';
export { getPseudolocalizer } from './Pseudolocalization';
