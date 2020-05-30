import * as path from 'path';
import * as webpack from 'webpack';
import { ConcatSource } from 'webpack-sources';
import { IAssetInfo, IModuleMap, IModuleInfo } from './ModuleMinifierPlugin.types';

/**
 * Generates a companion asset containing all extracted comments. If it is non-empty, returns a banner comment directing users to said companion asset.
 *
 * @param compilation - The webpack compilation
 * @param asset - The asset to process
 * @param minifiedModules - The minified modules to pull comments from
 * @param assetName - The name of the asset
 * @public
 */
export function generateLicenseFileForAsset(
  compilation: webpack.compilation.Compilation,
  asset: IAssetInfo,
  minifiedModules: IModuleMap
): string {
  // Extracted comments from the minified asset and from the modules.
  // The former generally will be nonexistent (since it contains only the runtime), but the modules may have some.
  const comments: Set<string> = new Set(asset.extractedComments);
  for (const moduleId of asset.modules) {
    const mod: IModuleInfo | undefined = minifiedModules.get(moduleId);
    if (mod) {
      for (const comment of mod.extractedComments) {
        comments.add(comment);
      }
    }
  }

  const assetName: string = asset.fileName;

  let banner: string = '';

  if (comments.size) {
    // There are license comments in this chunk, so generate the companion file and inject a banner
    const licenseSource: ConcatSource = new ConcatSource();
    comments.forEach((comment) => {
      licenseSource.add(comment);
    });
    const licenseFileName: string = `${assetName}.LICENSE.txt`;
    compilation.assets[licenseFileName] = licenseSource;
    banner = `/*! For license information please see ${path.basename(licenseFileName)} */\n`;
  }

  return banner;
}