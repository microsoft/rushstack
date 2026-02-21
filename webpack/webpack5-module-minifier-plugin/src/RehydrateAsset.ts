// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { sources, Compilation } from 'webpack';

import { CHUNK_MODULE_TOKEN, CHUNK_MODULE_REGEX } from './Constants.ts';
import type { IAssetInfo, IModuleMap, IModuleInfo } from './ModuleMinifierPlugin.types.ts';

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
  banner: string,
  emitRenderInfo?: boolean
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
  let charOffset: number = banner.length;

  // RegExp.exec uses null or an array as the return type, explicitly
  let match: RegExpExecArray | null = null;
  while ((match = CHUNK_MODULE_REGEX.exec(assetCode))) {
    const leadingColon: string = match[1]; // Captured ':' or empty string
    const hash: string = match[2]; // The module hash

    const moduleSource: IModuleInfo | undefined = moduleMap.get(hash);
    if (moduleSource === undefined) {
      compilation.errors.push(new WebpackError(`Missing module source for ${hash} in ${asset.fileName}!`));
    }

    const separator: sources.ReplaceSource = extractSegmentFromSource(
      ReplaceSource,
      cachedAssetSource,
      lastStart,
      match.index
    );

    source.add(separator);
    charOffset += separator.size();

    lastStart = CHUNK_MODULE_REGEX.lastIndex;

    if (moduleSource) {
      // Check if this module was in shorthand format
      const isShorthand: boolean = moduleSource.isShorthand === true;

      // For shorthand format, omit the colon. For regular format, keep it.
      if (!isShorthand && leadingColon) {
        source.add(leadingColon);
        charOffset += leadingColon.length;
      }

      const charLength: number = moduleSource.source.source().length;

      if (emitRenderInfo) {
        asset.renderInfo.set(moduleSource.id, {
          charOffset,
          charLength
        });
      }

      source.add(moduleSource.source);
      charOffset += charLength;
    } else {
      // Keep the colon if present for error module
      if (leadingColon) {
        source.add(leadingColon);
        charOffset += leadingColon.length;
      }

      const errorModule: string = `()=>{throw new Error(\`Missing module with hash "${hash}"\`)}`;

      source.add(errorModule);
      charOffset += errorModule.length;
    }

    source.add('\n');
    charOffset += 1;
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
