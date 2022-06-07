// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { sources } from 'webpack';
import type { Compilation } from 'webpack';

import { CHUNK_MODULE_TOKEN, CHUNK_MODULE_REGEX } from './Constants';
import type { IAssetInfo, IModuleMap, IModuleInfo } from './ModuleMinifierPlugin.types';

/**
 * Rehydrates an asset with minified modules.
 * @param asset - The asset
 * @param moduleMap - The minified modules
 * @param banner - A banner to inject for license information
 * @public
 */
export function rehydrateAsset(
  compilation: Compilation,
  asset: IAssetInfo,
  moduleMap: IModuleMap,
  banner: string
): sources.Source {
  const { source: assetSource } = asset;
  const {
    webpack: { sources, WebpackError }
  } = compilation.compiler;

  const assetCode: string = assetSource.source().toString();

  const tokenIndex: number = assetCode.indexOf(CHUNK_MODULE_TOKEN);
  if (tokenIndex < 0) {
    // This is not a JS asset.
    return assetSource;
  }

  const { CachedSource, ConcatSource, ReplaceSource } = sources;

  CHUNK_MODULE_REGEX.lastIndex = -1;
  let lastStart: number = 0;

  const cachedAssetSource: sources.CachedSource = new CachedSource(assetSource);

  const source: sources.ConcatSource = new ConcatSource(banner);

  // RegExp.exec uses null or an array as the return type, explicitly
  let match: RegExpExecArray | null = null;
  while ((match = CHUNK_MODULE_REGEX.exec(assetCode))) {
    const hash: string = match[1];

    const moduleSource: IModuleInfo | undefined = moduleMap.get(hash);
    if (moduleSource === undefined) {
      compilation.errors.push(new WebpackError(`Missing module source for ${hash} in ${asset.fileName}!`));
    }

    source.add(extractSegmentFromSource(ReplaceSource, cachedAssetSource, lastStart, match.index));
    lastStart = CHUNK_MODULE_REGEX.lastIndex;

    if (moduleSource) {
      source.add(moduleSource.source);
    } else {
      source.add(`()=>{throw new Error(\`Missing module with hash "${hash}"\`)}`);
    }
    source.add('\n');
  }

  source.add(extractSegmentFromSource(ReplaceSource, cachedAssetSource, lastStart, Infinity));

  return new CachedSource(source);
}

// In order to preserve source maps during substitution, have to use a ConcatSource instead of a ReplaceSource, so need to extract the segements from the original
function extractSegmentFromSource(
  replaceSourceConstructor: typeof sources.ReplaceSource,
  source: sources.Source,
  start: number,
  end: number
): sources.ReplaceSource {
  const result: sources.ReplaceSource = new replaceSourceConstructor(source);
  result.replace(end, Infinity, '');
  result.replace(0, start - 1, '');
  return result;
}
