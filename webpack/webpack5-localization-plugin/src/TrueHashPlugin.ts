// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  default as webpack,
  Compilation,
  Compiler,
  WebpackPluginInstance,
  Chunk,
  Asset,
  sources
} from 'webpack';
import { Text } from '@rushstack/node-core-library';

import type { ILocalizedWebpackChunk } from './webpackInterfaces';
import type {
  ICustomHashFunctionOptions,
  IHashAlgorithmOptions,
  ITrueHashPluginOptions,
  WebpackHash
} from './interfaces';
import { LocalizationPlugin } from './LocalizationPlugin';

const PLUGIN_NAME: 'true-hash' = 'true-hash';

interface IHashReplacement {
  existingHash: string;
  trueHashByLocale: string | Record<string, string> | undefined;
}

export type HashFn = (contents: string | Buffer) => string;

export interface IGetHashFunctionOptions {
  thisWebpack: typeof webpack;
  compilation: Compilation;
  options?: ITrueHashPluginOptions;
}

export function getHashFunction({ thisWebpack, compilation, options = {} }: IGetHashFunctionOptions): HashFn {
  const { hash, hashFunction } = options as Partial<IHashAlgorithmOptions & ICustomHashFunctionOptions>;
  let hashFn: (contents: string | Buffer) => string;
  if (hashFunction) {
    hashFn = hashFunction;
    if (hash) {
      compilation.errors.push(
        new thisWebpack.WebpackError(
          `The TrueHashPlugin was configured with both "hash" and "hashFunction". ` +
            `Only one of these options can be specified. Falling back to the custom hash function.`
        )
      );
    }
  } else {
    const {
      hashFunction: hashFunctionFromOptions = 'md5',
      hashDigest = 'hex',
      hashDigestLength
    } = compilation.outputOptions;
    const hashToUse: WebpackHash = hash ?? hashFunctionFromOptions;
    hashFn = (contents: string | Buffer) =>
      thisWebpack.util
        .createHash(hashToUse)
        .update(contents)
        .digest(hashDigest)
        .toString()
        .slice(0, hashDigestLength);
  }

  return hashFn;
}

export interface IUpdateAssetHashesOptions {
  thisWebpack: typeof webpack;
  compilation: Compilation;
  hashFn: HashFn;
  filesByChunkName?: Map<string, Record<string, string>>;
}

export function updateAssetHashes({
  thisWebpack,
  compilation,
  hashFn,
  filesByChunkName
}: IUpdateAssetHashesOptions): void {
  const unprocessedDependenciesByChunk: Map<Chunk, Set<Chunk>> = new Map();
  const dependenciesByChunk: Map<Chunk, Set<Chunk>> = new Map();
  const dependentsByChunk: Map<Chunk, Set<Chunk>> = new Map();
  for (const chunk of compilation.chunks) {
    let unprocessedDependencies: Set<Chunk> | undefined = unprocessedDependenciesByChunk.get(chunk);
    if (!unprocessedDependencies) {
      unprocessedDependencies = new Set();
      unprocessedDependenciesByChunk.set(chunk, unprocessedDependencies);
    }

    let dependencies: Set<Chunk> | undefined = dependenciesByChunk.get(chunk);
    if (!dependencies) {
      dependencies = new Set();
      dependenciesByChunk.set(chunk, dependencies);
    }

    if (chunk.hasRuntime()) {
      for (const asyncChunk of chunk.getAllAsyncChunks()) {
        unprocessedDependencies.add(asyncChunk);
        dependencies.add(asyncChunk);

        let dependents: Set<Chunk> | undefined = dependentsByChunk.get(asyncChunk);
        if (!dependents) {
          dependents = new Set();
          dependentsByChunk.set(asyncChunk, dependents);
        }

        dependents.add(chunk);
      }
    }
  }

  const hashReplacementsByChunk: Map<Chunk, IHashReplacement> = new Map();
  const unprocessedChunks: Set<Chunk> = new Set(compilation.chunks);
  let previousSize: number = -1;
  while (unprocessedChunks.size > 0) {
    const currentSize: number = unprocessedChunks.size;
    if (currentSize === previousSize) {
      compilation.errors.push(
        new thisWebpack.WebpackError(
          `Detected a cycle in the chunk dependencies. This should not be possible.`
        )
      );

      break;
    }

    previousSize = currentSize;

    for (const chunk of unprocessedChunks) {
      if (unprocessedDependenciesByChunk.get(chunk)?.size === 0) {
        // TODO: do we need to check if the chunk is rendered?
        if (!chunk.renderedHash) {
          compilation.errors.push(
            new thisWebpack.WebpackError(`Could not find the hash for chunk ${chunk.id}.`)
          );
        } else {
          const existingHash: string = chunk.contentHash.javascript;
          const chunkDependencies: Set<Chunk> | undefined = dependenciesByChunk.get(chunk);
          if (!chunkDependencies) {
            compilation.errors.push(
              new thisWebpack.WebpackError(`Could not find dependencies for chunk ${chunk.id}.`)
            );
          } else {
            function processChunkAsset(jsAssetName: string, locale: string | undefined): string | undefined {
              const asset: Readonly<Asset> | undefined = compilation.getAsset(jsAssetName);
              if (!asset) {
                compilation.errors.push(
                  new thisWebpack.WebpackError(`Could not find asset "${jsAssetName}" for chunk ${chunk.id}.`)
                );
              } else {
                let assetSource: sources.Source = asset.source;
                const assetName: string = asset.name;
                if (chunkDependencies!.size > 0) {
                  const relevantHashReplacements: Map<string, string> = new Map();
                  let hasAnyReplacements: boolean = false;
                  let allReplacementsAreTheSameLengthAsOriginals: boolean = true;
                  for (const dependency of chunkDependencies!) {
                    const asyncChunkHashReplacements: IHashReplacement | undefined =
                      hashReplacementsByChunk.get(dependency);
                    if (!asyncChunkHashReplacements) {
                      compilation.errors.push(
                        new thisWebpack.WebpackError(
                          `Could not find hash replacements for chunk ${dependency.id}.`
                        )
                      );
                    } else {
                      const { existingHash: otherChunkExistingHash, trueHashByLocale } =
                        asyncChunkHashReplacements;
                      let replacementHash: string | undefined;
                      if (typeof trueHashByLocale === 'object') {
                        if (locale) {
                          replacementHash = trueHashByLocale[locale];
                        }
                      } else {
                        replacementHash = trueHashByLocale;
                      }

                      if (replacementHash) {
                        if (relevantHashReplacements.has(otherChunkExistingHash)) {
                          compilation.errors.push(
                            new thisWebpack.WebpackError(
                              `Found multiple replacements for hash ${otherChunkExistingHash} ` +
                                `in chunk ${chunk.id}.`
                            )
                          );
                        } else {
                          allReplacementsAreTheSameLengthAsOriginals &&=
                            replacementHash.length === otherChunkExistingHash.length;
                          relevantHashReplacements.set(otherChunkExistingHash, replacementHash);
                          hasAnyReplacements = true;
                        }
                      }
                    }
                  }

                  if (hasAnyReplacements) {
                    const sourceString: string = assetSource.source().toString();
                    const replaceSource: sources.ReplaceSource = new thisWebpack.sources.ReplaceSource(
                      assetSource,
                      assetName
                    );

                    if (allReplacementsAreTheSameLengthAsOriginals) {
                      // If all of the replacements are the same length as the originals, we can walk the string
                      // in non-reverse order.
                      const regexp: RegExp = new RegExp(
                        Array.from(relevantHashReplacements.keys())
                          .map((hashToReplace) => Text.escapeRegExp(hashToReplace))
                          .join('|'),
                        'g'
                      );
                      let match: RegExpMatchArray | null;
                      while ((match = regexp.exec(sourceString)) !== null) {
                        const { 0: originalHash, index } = match;
                        const matchStart: number = index!;
                        const matchEnd: number = matchStart + originalHash.length - 1;
                        const replacement: string = relevantHashReplacements.get(originalHash)!;
                        replaceSource.replace(matchStart, matchEnd, replacement);
                      }
                    } else {
                      // If the replacements are not the same length as the originals, we need to reverse the
                      // string and walk it in reverse order to keep the indices correct.
                      const reversedSourceString: string = Text.reverse(sourceString);
                      const sourceStringLength: number = sourceString.length;
                      const regexp: RegExp = new RegExp(
                        Array.from(relevantHashReplacements.keys())
                          .map((hashToReplace) => Text.escapeRegExp(Text.reverse(hashToReplace)))
                          .join('|'),
                        'g'
                      );
                      let match: RegExpMatchArray | null;
                      while ((match = regexp.exec(reversedSourceString)) !== null) {
                        const { 0: reverseOriginalHash, index } = match;
                        const matchStart: number = index!;
                        const matchEnd: number = matchStart + reverseOriginalHash.length - 1;
                        const replacement: string = relevantHashReplacements.get(
                          Text.reverse(reverseOriginalHash)
                        )!;

                        // Figure out the location in the original string
                        const reversedMatchStart: number = sourceStringLength - matchEnd - 1;
                        const reversedMatchEnd: number = sourceStringLength - matchStart - 1;
                        replaceSource.replace(reversedMatchStart, reversedMatchEnd, replacement);
                      }
                    }

                    assetSource = replaceSource;
                    compilation.updateAsset(jsAssetName, assetSource);
                  }
                }

                if (jsAssetName.includes(existingHash)) {
                  const trueHash: string = hashFn(assetSource.buffer());
                  if (trueHash !== existingHash) {
                    const newAssetName: string = jsAssetName.replace(existingHash, trueHash);
                    compilation.renameAsset(jsAssetName, newAssetName);

                    if (locale) {
                      const filesForChunkName: Record<string, string> | undefined = filesByChunkName?.get(
                        chunk.name
                      );
                      if (filesForChunkName) {
                        filesForChunkName[locale] = newAssetName;
                      }
                    }

                    return trueHash;
                  }
                }
              }
            }

            const localizedFiles: Record<string, string> | undefined = (chunk as ILocalizedWebpackChunk)
              .localizedFiles;
            if (localizedFiles) {
              const trueHashByLocale: Record<string, string> = {};
              hashReplacementsByChunk.set(chunk, {
                existingHash,
                trueHashByLocale
              });
              for (const [locale, jsAssetName] of Object.entries(localizedFiles)) {
                const trueHash: string | undefined = processChunkAsset(jsAssetName, locale);
                if (trueHash) {
                  trueHashByLocale[locale] = trueHash;
                }
              }
            } else {
              const assetNames: string[] = Array.from(chunk.files);
              let jsAssetName: string | undefined;
              for (const assetName of assetNames) {
                if (assetName.endsWith('.js')) {
                  if (jsAssetName) {
                    compilation.errors.push(
                      new thisWebpack.WebpackError(`Found multiple .js assets for chunk ${chunk.id}.`)
                    );
                  } else {
                    jsAssetName = assetName;
                  }
                }
              }

              if (!jsAssetName) {
                compilation.errors.push(
                  new thisWebpack.WebpackError(`Could not find a .js asset for chunk ${chunk.id}.`)
                );
              } else {
                const trueHash: string | undefined = processChunkAsset(jsAssetName, undefined);
                hashReplacementsByChunk.set(chunk, { existingHash, trueHashByLocale: trueHash });
              }
            }
          }

          unprocessedChunks.delete(chunk);
          const dependents: Set<Chunk> | undefined = dependentsByChunk.get(chunk);
          if (dependents) {
            for (const dependent of dependents) {
              unprocessedDependenciesByChunk.get(dependent)?.delete(chunk);
            }
          }
        }
      }
    }
  }
}

/**
 * @public
 */
export class TrueHashPlugin implements WebpackPluginInstance {
  private readonly _options: ITrueHashPluginOptions;

  public constructor(options: ITrueHashPluginOptions = {}) {
    this._options = options;
  }

  public apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
      const { webpack: thisWebpack } = compiler;

      let hasLocalizationPluginTrueHashOption: boolean = false;
      if (compiler.options.plugins) {
        for (const plugin of compiler.options.plugins) {
          if (plugin instanceof LocalizationPlugin && plugin._options.useTrueHashes) {
            hasLocalizationPluginTrueHashOption = true;
            break;
          }
        }
      }

      if (hasLocalizationPluginTrueHashOption) {
        compilation.warnings.push(
          new thisWebpack.WebpackError(
            `The ${TrueHashPlugin.name} is not compatible with the LocalizationPlugin's "useTrueHashes" option. ` +
              `Because the LocalizationPlugin is already handling true hashes, the ${TrueHashPlugin.name} plugin ` +
              'will have no effect.'
          )
        );
      } else {
        const { stageOverride: processAssetsStage = thisWebpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE } =
          this._options as IHashAlgorithmOptions & ICustomHashFunctionOptions;
        const hashFn: (contents: string | Buffer) => string = getHashFunction({
          thisWebpack,
          compilation,
          options: this._options
        });

        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            stage: processAssetsStage
          },
          () => updateAssetHashes({ thisWebpack, compilation, hashFn })
        );
      }
    });
  }
}
