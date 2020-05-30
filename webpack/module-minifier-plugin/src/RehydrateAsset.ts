import { RawSource, ConcatSource, Source } from 'webpack-sources';

import { CHUNK_MODULES_TOKEN } from './Constants';
import { IAssetInfo, IModuleMap, IModuleInfo } from './ModuleMinifierPlugin.types';

/**
 * Rehydrates an asset with minified modules.
 * @param asset - The asset
 * @param moduleMap - The minified modules
 * @param banner - A banner to inject for license information
 * @public
 */
export function rehydrateAsset(asset: IAssetInfo, moduleMap: IModuleMap, banner: string): Source {
  const {
      code,
      modules
  } = asset;

  const tokenIndex: number = code.indexOf(CHUNK_MODULES_TOKEN);
  const suffixStart: number = tokenIndex + CHUNK_MODULES_TOKEN.length;

  const prefix: string = code.slice(0, tokenIndex);
  const suffix: string = code.slice(suffixStart);

  if (!modules.length) {
      // Empty chunk, degenerate case
      return new RawSource(`${banner}${prefix}[]${suffix}`);
  }

  const emptyFunction = 'function(){}'; // eslint-disable-line @typescript-eslint/typedef

  const source: ConcatSource = new ConcatSource(banner, prefix);

  const firstModuleId: string | number = modules[0];
  const lastModuleId: string | number = modules[modules.length - 1];

  // Extended logic from webpack.Template.getModulesArrayBounds
  const maxId: number = typeof firstModuleId === 'number' ? firstModuleId : Infinity;
  const minId: number = typeof lastModuleId === 'number' ? lastModuleId : 0;

  let concatArrayOverhead: number = 18 + ("" + minId).length + maxId - minId;
  const simpleArrayOverhead: number = 2 + maxId;

  let useObject: boolean = typeof firstModuleId !== 'number' || typeof lastModuleId !== 'number';
  let objectOverhead: number = 1;
  let lastId: number = minId;

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
      const fillerArraySavings: number = delta + 1 - (11 + ('' + delta).length);
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
      source.add(`${separator}${id}:`);
      separator = ',';

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: string = item ? item.code : emptyFunction;
      source.add(moduleCode);
    }

    source.add('}');
  } else {
    // Write one or more array literals, joined by Array(gap) expressions

    // There will never be more than 16 + ("" + minId).length consecutive commas, so 40 is more than will ever be used
    // This is because the above criteria triggers an Array(len) expression instead
    const enoughCommas: string = ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';

    lastId = useConcat ? minId : 0;
    // TODO: Just because we want to use concat elsewhere doesn't mean its optimal to use at the start
    let separator: string = useConcat ? `Array(${minId}).concat([` : '[';
    for (const id of modules) {
      const delta: number = id as number - lastId - 1;
      const deltaStr: string = '' + delta;
      const fillerArrayThreshold: number = 11 + deltaStr.length;

      const item: IModuleInfo | undefined = moduleMap.get(id);
      const moduleCode: string = item ? item.code : emptyFunction;

      if (useConcat && delta + 1 > fillerArrayThreshold) {
          source.add(`],Array(${deltaStr}),[`);
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

  return source;
}