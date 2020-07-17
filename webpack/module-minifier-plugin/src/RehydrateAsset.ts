// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Template } from 'webpack';
import { CachedSource, ConcatSource, ReplaceSource, Source } from 'webpack-sources';

import { CHUNK_MODULES_TOKEN } from './Constants';
import { getIdentifier } from './MinifiedIdentifier';
import { IAssetInfo, IModuleMap, IModuleInfo, IExtendedModule } from './ModuleMinifierPlugin.types';

/**
 * Rehydrates an asset with minified modules.
 * @param asset - The asset
 * @param moduleMap - The minified modules
 * @param banner - A banner to inject for license information
 * @public
 */
export function rehydrateAsset(asset: IAssetInfo, moduleMap: IModuleMap, banner: string): Source {
  const { source: assetSource, modules, externalNames } = asset;

  const assetCode: string = assetSource.source();

  const tokenIndex: number = assetCode.indexOf(CHUNK_MODULES_TOKEN);
  const suffixStart: number = tokenIndex + CHUNK_MODULES_TOKEN.length;
  const suffix: string = assetCode.slice(suffixStart);

  const prefix: ReplaceSource = new ReplaceSource(assetSource);
  // Preserve source map via fiddly logic
  prefix.replace(tokenIndex, assetCode.length, '');

  if (!modules.length) {
    // Empty chunk, degenerate case
    return new ConcatSource(banner, prefix, '[]', suffix);
  }

  const emptyFunction = 'function(){}'; // eslint-disable-line @typescript-eslint/typedef
  // This must not have the global flag set
  const validIdRegex: RegExp = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  const source: ConcatSource = new ConcatSource(banner, prefix);

  const firstModuleId: string | number = modules[0];
  const lastModuleId: string | number = modules[modules.length - 1];

  // Extended logic from webpack.Template.getModulesArrayBounds
  const minId: number = typeof firstModuleId === 'number' ? firstModuleId : 0;
  const maxId: number = typeof lastModuleId === 'number' ? lastModuleId : Infinity;

  const simpleArrayOverhead: number = 2 + maxId;
  let concatArrayOverhead: number = simpleArrayOverhead + 9;

  let useObject: boolean = typeof firstModuleId !== 'number' || typeof lastModuleId !== 'number';
  let objectOverhead: number = 1;
  let lastId: number = 0;

  if (!useObject) {
    for (const id of modules) {
      if (typeof id !== 'number') {
        // This must be an object
        useObject = true;
        break;
      }

      // This is the extension from webpack.Template.getModulesArrayBounds
      // We can make smaller emit by injecting additional filler arrays
      const delta: number = id - lastId - 1;

      // Compare the length of `],Array(${delta}),[` to ','.repeat(delta + 1)
      const threshold: number = (lastId === 0 ? 7 : 11) + ('' + delta).length;
      const fillerArraySavings: number = delta + 1 - threshold;
      if (fillerArraySavings > 0) {
        concatArrayOverhead -= fillerArraySavings;
      }

      objectOverhead += 2 + ('' + id).length;
      lastId = id;
    }
  }

  const useConcat: boolean = concatArrayOverhead < simpleArrayOverhead;

  const arrayOverhead: number = useConcat ? concatArrayOverhead : simpleArrayOverhead;

  useObject = useObject || objectOverhead < arrayOverhead;

  if (useObject) {
    // Write an object literal
    let separator: '{' | ',' = '{';
    for (const id of modules) {
      // If the id is legal to use as a key in a JavaScript object literal, use as-is
      const javascriptId: string | number =
        typeof id !== 'string' || validIdRegex.test(id) ? id : JSON.stringify(id);
      source.add(`${separator}${javascriptId}:`);
      separator = ',';

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: Source | string = item ? item.source : emptyFunction;
      source.add(moduleCode);
    }

    source.add('}');
  } else {
    // Write one or more array literals, joined by Array(gap) expressions

    // There will never be more than 16 + ("" + minId).length consecutive commas, so 40 is more than will ever be used
    // This is because the above criteria triggers an Array(len) expression instead
    const enoughCommas: string = ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';

    const useConcatAtStart: boolean = useConcat && minId > 8;
    lastId = useConcat ? minId : 0;
    // TODO: Just because we want to use concat elsewhere doesn't mean its optimal to use at the start
    let separator: string = useConcatAtStart ? `Array(${minId}).concat([` : '[';
    let concatInserted: boolean = useConcatAtStart;
    for (const id of modules) {
      const delta: number = (id as number) - lastId - 1;
      const deltaStr: string = '' + delta;
      const fillerArrayThreshold: number = 11 + deltaStr.length;

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: Source | string = item ? item.source : emptyFunction;

      if (useConcat && delta + 1 > fillerArrayThreshold) {
        if (concatInserted) {
          source.add(`],Array(${deltaStr}),[`);
        } else {
          source.add(`].concat(Array(${deltaStr}),[`);
          concatInserted = true;
        }
      } else {
        source.add(separator + enoughCommas.slice(0, delta + 1));
      }
      lastId = id as number;
      source.add(moduleCode);

      separator = '';
    }

    source.add(useConcat ? '])' : ']');
  }

  source.add(suffix);

  const externals: Map<string, string> = new Map();
  let nextOrdinal: number = 0;
  for (const id of modules) {
    const item: IModuleInfo | undefined = moduleMap.get(id);
    const mod: IExtendedModule | undefined = item && item.module;
    if (mod && mod.external) {
      const key: string = `${Template.toIdentifier(`${mod.id}`)}__`;
      const ordinal: number = ++nextOrdinal;
      const miniId: string = getIdentifier(ordinal);
      externals.set(key, miniId);
    }
  }

  const cached: CachedSource = new CachedSource(source);

  if (externalNames.size) {
    const replaceSource: ReplaceSource = new ReplaceSource(cached);
    const code: string = cached.source();

    const externalIdRegex: RegExp = /__WEBPACK_EXTERNAL_MODULE_[A-Za-z0-9_$]+/g;

    // RegExp.exec uses null or an array as the return type, explicitly
    let match: RegExpExecArray | null = null; // eslint-disable-line @rushstack/no-null
    while ((match = externalIdRegex.exec(code))) {
      const id: string = match[0];
      const mapped: string | undefined = externalNames.get(id);

      if (mapped === undefined) {
        console.error(`Missing minified external for ${id} in ${asset.fileName}!`);
      }

      replaceSource.replace(match.index, externalIdRegex.lastIndex - 1, mapped);
    }

    return new CachedSource(replaceSource);
  }

  return cached;
}
