// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { ILocalizationFile, ILocalizedString, IPseudolocaleOptions } from './interfaces';
export { parseLocFile, IParseLocFileOptions } from './LocFileParser';
export {
  ITypingsGeneratorOptions,
  LocFileTypingsGenerator as TypingsGenerator
} from './LocFileTypingsGenerator';
export { readResxFileAsLocFile, readResxAsLocFile, IResxReaderOptions } from './ResxReader';
export { getPseudolocalizer } from './Pseudolocalization';
