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
export { parseResx, IParseResxOptions, IParseResxOptionsBase } from './parsers/parseResx';
export { parseLocFile, IParseLocFileOptions, ParserKind } from './LocFileParser';
export { ITypingsGeneratorOptions, TypingsGenerator } from './TypingsGenerator';
export { getPseudolocalizer } from './Pseudolocalization';
