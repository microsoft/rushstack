// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { Comment } from 'estree';
import type { Compilation, Module, sources } from 'webpack';

import type { IAssetInfo } from './ModuleMinifierPlugin.types';

function getAllComments(modules: Iterable<Module>): Set<string> {
  const allComments: Set<string> = new Set();

  for (const webpackModule of modules) {
    const submodules: Iterable<Module> = (webpackModule.context === null &&
      (webpackModule as { _modules?: Iterable<Module> })._modules) || [webpackModule];
    for (const submodule of submodules) {
      const subModuleComments: Iterable<Comment> | undefined = (
        submodule.factoryMeta as {
          comments?: Iterable<Comment>;
        }
      )?.comments;

      if (subModuleComments) {
        for (const comment of subModuleComments) {
          const value: string = comment.type === 'Line' ? `//${comment.value}\n` : `/*${comment.value}*/\n`;
          allComments.add(value);
        }
      }
    }
  }

  return allComments;
}

/**
 * Generates a companion asset containing all extracted comments and returns a banner directing users to it,
 * or returns the comments themselves when short-license inlining is enabled and saves bytes.
 *
 * @param compilation - The webpack compilation
 * @param asset - The asset to process
 * @param inlineShortLicenses - Inline the complete license text when it is smaller than the reference banner
 * @public
 */
export function generateLicenseFileForAsset(
  compilation: Compilation,
  asset: IAssetInfo,
  inlineShortLicenses: boolean = false
): string {
  // Extracted comments from the modules.
  const modules: Iterable<Module> = compilation.chunkGraph.getChunkModulesIterable(asset.chunk);
  const comments: Set<string> = getAllComments(modules);

  const assetName: string = asset.fileName;

  let banner: string = '';

  if (comments.size) {
    const licenseSource: sources.ConcatSource = new compilation.compiler.webpack.sources.ConcatSource();
    comments.forEach((comment) => {
      licenseSource.add(comment);
    });
    const licenseFileName: string = `${assetName}.LICENSE.txt`;
    banner = `/*! For license information please see ${path.basename(licenseFileName)} */\n`;
    if (inlineShortLicenses && licenseSource.size() < Buffer.byteLength(banner, 'utf8')) {
      return licenseSource.source().toString();
    }

    compilation.emitAsset(licenseFileName, licenseSource);
  }

  return banner;
}
