// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type {
  ILocalizationFile,
  ILocalizedString,
  IPseudolocaleOptions,
  IParseFileOptions,
  IgnoreStringFunction
} from './interfaces';
export { parseLocJson } from './parsers/parseLocJson';
export { parseResJson } from './parsers/parseResJson';
export { parseLocFile, IParseLocFileOptions, ParserKind } from './LocFileParser';
export {
  ITypingsGeneratorOptions,
  LocFileTypingsGenerator as TypingsGenerator
} from './LocFileTypingsGenerator';
export { readResxFileAsLocFile, readResxAsLocFile, IResxReaderOptions } from './ResxReader';
export { getPseudolocalizer } from './Pseudolocalization';
