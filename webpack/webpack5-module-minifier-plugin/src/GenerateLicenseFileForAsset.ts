// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { Comment } from 'estree';
import type { Compilation, Module } from 'webpack';
import type { sources } from 'webpack';

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
 * Generates a companion asset containing all extracted comments. If it is non-empty, returns a banner comment directing users to said companion asset.
 *
 * @param compilation - The webpack compilation
 * @param asset - The asset to process
 * @public
 */
export function generateLicenseFileForAsset(compilation: Compilation, asset: IAssetInfo): string {
  // Extracted comments from the modules.
  const modules: Iterable<Module> = compilation.chunkGraph.getChunkModulesIterable(asset.chunk);
  const comments: Set<string> = getAllComments(modules);

  const assetName: string = asset.fileName;

  let banner: string = '';

  if (comments.size) {
    // There are license comments in this chunk, so generate the companion file and inject a banner
    const licenseSource: sources.ConcatSource = new compilation.compiler.webpack.sources.ConcatSource();
    comments.forEach((comment) => {
      licenseSource.add(comment);
    });
    const licenseFileName: string = `${assetName}.LICENSE.txt`;
    compilation.emitAsset(licenseFileName, licenseSource);
    banner = `/*! For license information please see ${path.basename(licenseFileName)} */\n`;
  }

  return banner;
}
