// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CachedSource, ConcatSource, ReplaceSource, type Source } from 'webpack-sources';

import { CHUNK_MODULES_TOKEN } from './Constants.ts';
import type { IAssetInfo, IModuleMap, IModuleInfo } from './ModuleMinifierPlugin.types.ts';

/**
 * Rehydrates an asset with minified modules.
 * @param asset - The asset
 * @param moduleMap - The minified modules
 * @param banner - A banner to inject for license information
 * @param emitRenderInfo - If set, provide information about module offsets
 * @public
 */
export function rehydrateAsset(
  asset: IAssetInfo,
  moduleMap: IModuleMap,
  banner: string,
  emitRenderInfo?: boolean
): Source {
  const { source: assetSource, modules } = asset;

  const assetCode: string = assetSource.source() as string;

  const tokenIndex: number = assetCode.indexOf(CHUNK_MODULES_TOKEN);
  if (tokenIndex < 0) {
    // This is not a JS asset.
    return handleExternals(assetSource, asset);
  }
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
  // Source.size() is in bytes, we want characters
  let charOffset: number = source.source().length;

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
      const currentSeparator: string = `${separator}${javascriptId}:`;

      source.add(currentSeparator);
      charOffset += currentSeparator.length;

      separator = ',';

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: Source | string = item ? item.source : emptyFunction;
      // Source.size() is in bytes, we want characters
      const charLength: number =
        typeof moduleCode === 'string' ? moduleCode.length : moduleCode.source().toString().length;

      if (emitRenderInfo) {
        asset.renderInfo.set(id, {
          charOffset,
          charLength
        });
      }

      source.add(moduleCode);
      charOffset += charLength;
    }

    source.add('}');
  } else {
    // Write one or more array literals, joined by Array(gap) expressions

    // There will never be more than 16 + ("" + minId).length consecutive commas, so 40 is more than will ever be used
    // This is because the above criteria triggers an Array(len) expression instead
    const enoughCommas: string = ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';

    const useConcatAtStart: boolean = useConcat && minId > 8;
    lastId = useConcatAtStart ? minId : 0;
    // TODO: Just because we want to use concat elsewhere doesn't mean its optimal to use at the start
    let separator: string = useConcatAtStart ? `Array(${minId}).concat([` : '[';
    let concatInserted: boolean = useConcatAtStart;
    for (const id of modules) {
      const delta: number = (id as number) - lastId - 1;
      const deltaStr: string = '' + delta;
      const fillerArrayThreshold: number = 11 + deltaStr.length;

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: Source | string = item ? item.source : emptyFunction;
      // Source.size() is in bytes, we want characters
      const charLength: number =
        typeof moduleCode === 'string' ? moduleCode.length : moduleCode.source().toString().length;

      if (useConcat && delta + 1 > fillerArrayThreshold) {
        if (concatInserted) {
          const currentSeparator: string = `],Array(${deltaStr}),[`;

          source.add(currentSeparator);
          charOffset += currentSeparator.length;
        } else {
          const currentSeparator: string = `].concat(Array(${deltaStr}),[`;
          concatInserted = true;

          source.add(currentSeparator);
          charOffset += currentSeparator.length;
        }
      } else {
        const currentSeparator: string = separator + enoughCommas.slice(0, delta + 1);

        source.add(currentSeparator);
        charOffset += currentSeparator.length;
      }
      lastId = id as number;

      if (emitRenderInfo) {
        asset.renderInfo.set(id, {
          charOffset,
          charLength
        });
      }

      source.add(moduleCode);
      charOffset += charLength;

      separator = '';
    }

    source.add(useConcat ? '])' : ']');
  }

  source.add(suffix);

  return handleExternals(new CachedSource(source), asset);
}

function handleExternals(source: Source, asset: IAssetInfo): Source {
  const { externalNames } = asset;

  if (externalNames.size) {
    const replaceSource: ReplaceSource = new ReplaceSource(source);
    const code: string = source.source() as string;

    const externalIdRegex: RegExp = /__WEBPACK_EXTERNAL_MODULE_[A-Za-z0-9_$]+/g;

    // RegExp.exec uses null or an array as the return type, explicitly
    let match: RegExpExecArray | null = null;
    while ((match = externalIdRegex.exec(code))) {
      const id: string = match[0];
      const mapped: string | undefined = externalNames.get(id);

      if (mapped === undefined) {
        // eslint-disable-next-line no-console
        console.error(`Missing minified external for ${id} in ${asset.fileName}!`);
      } else {
        replaceSource.replace(match.index, externalIdRegex.lastIndex - 1, mapped);
      }
    }

    return new CachedSource(replaceSource);
  }

  return source;
}
