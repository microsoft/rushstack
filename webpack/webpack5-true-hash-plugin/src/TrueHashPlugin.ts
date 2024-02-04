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
import type { ILocalizedWebpackChunk } from '@rushstack/webpack5-localization-plugin';
import { Text } from '@rushstack/node-core-library';

const PLUGIN_NAME: 'true-hash' = 'true-hash';

type WebpackHash = Parameters<typeof webpack.util.createHash>[0];

interface IHashReplacement {
  existingHash: string;
  trueHashByLocale: string | Record<string, string>;
}

/**
 * @public
 */
export interface ITrueHashPluginOptionsBase {
  stageOverride?: number;
}

/**
 * @public
 */
export interface IHashAlgorithmOptions extends ITrueHashPluginOptionsBase {
  /**
   * The name of the hash algorithm to use, e.g. 'sha256', or a webpack Hash object.
   *
   * @defaultValue
   * 'sha256'
   */
  hash?: WebpackHash;
}

/**
 * @public
 */
export interface ICustomHashFunctionOptions extends ITrueHashPluginOptionsBase {
  /**
   * A function that takes the contents of a file and returns a hash.
   */
  hashFunction: (contents: string | Buffer) => string;
}

/**
 * @public
 */
export type ITrueHashPluginOptions = IHashAlgorithmOptions | ICustomHashFunctionOptions;

/**
 * @public
 */
export class TrueHashPlugin implements WebpackPluginInstance {
  private readonly _options: ITrueHashPluginOptions;

  public constructor(options: ITrueHashPluginOptions) {
    this._options = options;
  }

  /**
   * Apply this plugin to the specified webpack compiler.
   */
  public apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
      const { webpack: thisWebpack } = compiler;
      const {
        stageOverride: processAssetsStage = thisWebpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        hash,
        hashFunction
      } = this._options as IHashAlgorithmOptions & ICustomHashFunctionOptions;
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

      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: processAssetsStage
        },
        () => {
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

          const hashReplacementsByChunk: Map<Chunk, IHashReplacement> = new Map();
          const unprocessedChunks: Set<Chunk> = new Set(compilation.chunks);
          while (unprocessedChunks.size > 0) {
            for (const chunk of unprocessedChunks) {
              if (unprocessedDependenciesByChunk.get(chunk)?.size === 0) {
                // TODO: do we need to check if the chunk is rendered?
                if (!chunk.renderedHash) {
                  compilation.errors.push(
                    new thisWebpack.WebpackError(
                      `${TrueHashPlugin.name} could not find the hash for chunk ${chunk.id}.`
                    )
                  );
                } else {
                  const existingHash: string = chunk.contentHash.javascript;
                  const chunkDependencies: Set<Chunk> | undefined = dependenciesByChunk.get(chunk);
                  if (!chunkDependencies) {
                    compilation.errors.push(
                      new thisWebpack.WebpackError(
                        `${TrueHashPlugin.name} could not find dependencies for chunk ${chunk.id}.`
                      )
                    );
                  } else {
                    function processChunkAsset(
                      jsAssetName: string,
                      locale: string | undefined
                    ): string | undefined {
                      const asset: Readonly<Asset> | undefined = compilation.getAsset(jsAssetName);
                      if (!asset) {
                        compilation.errors.push(
                          new thisWebpack.WebpackError(
                            `${TrueHashPlugin.name} could not find asset "${jsAssetName}" for chunk ${chunk.id}.`
                          )
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
                                  `${TrueHashPlugin.name} could not find hash replacements for chunk ${dependency.id}.`
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
                                      `${TrueHashPlugin.name} found multiple replacements for hash ${otherChunkExistingHash} ` +
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
                            const replaceSource: sources.ReplaceSource =
                              new thisWebpack.sources.ReplaceSource(assetSource, assetName);

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
                            compilation.renameAsset(jsAssetName, jsAssetName.replace(existingHash, trueHash));
                            return trueHash;
                          }
                        }
                      }
                    }

                    const localizedFiles: Record<string, string> | undefined = (
                      chunk as ILocalizedWebpackChunk
                    ).localizedFiles;
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
                              new thisWebpack.WebpackError(
                                `${TrueHashPlugin.name} found multiple .js assets for chunk ${chunk.id}.`
                              )
                            );
                          } else {
                            jsAssetName = assetName;
                          }
                        }
                      }

                      if (!jsAssetName) {
                        compilation.errors.push(
                          new thisWebpack.WebpackError(
                            `${TrueHashPlugin.name} could not find a .js asset for chunk ${chunk.id}.`
                          )
                        );
                      } else {
                        const trueHash: string | undefined = processChunkAsset(jsAssetName, undefined);
                        if (trueHash) {
                          hashReplacementsByChunk.set(chunk, { existingHash, trueHashByLocale: trueHash });
                        }
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
      );
    });
  }
}
