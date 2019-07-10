// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Gulp from 'gulp';
import * as path from 'path';
import globEscape = require('glob-escape');
import { GulpTask } from '../GulpTask';

/**
 * Configuration for CopyStaticAssetsTask
 * @public
 */
export interface ICopyStaticAssetsTaskConfig {
  includeExtensions?: string[];
  excludeExtensions?: string[];
  includeFiles?: string[];
  excludeFiles?: string[];
}

/**
 * Copies files from the /src folder into the /lib folder, if they have certain file extensions
 * or file paths.
 *
 * @privateRemarks
 *
 * Example:
 * ```
 *  IN:
 *    setConfig({
 *      includeExtensions: ['template.html'],
 *      excludeExtensions: ['png'],
 *      includeFiles: ['/assets/goodAsset.png'],
 *      excludeFiles: ['/assets/badAsset.gif']
 *    })
 *
 *  OUT:
 *    copies all files that match our standard webpack file-loader extensions
 *      ('jpg', 'png', 'woff', 'eot', 'ttf', 'svg', 'gif'), with the following extensions, in the following order of
 *    precedence (from lowest to highest):
 *      1. including additional extensions (i.e. 'template.html')
 *      2. excluding specific extensions (i.e. 'png')
 *      3. including specific globs (i.e. '/assets/goodAsset.png')
 *      4. excluding specific globs (i.e. '/assets/badAsset.gif')
 * ```
 * @public
 */
export class CopyStaticAssetsTask extends GulpTask<ICopyStaticAssetsTaskConfig> {
  constructor() {
    super('copy-static-assets', {
      includeExtensions: [],
      excludeExtensions: [],
      includeFiles: [],
      excludeFiles: []
    });
  }

  public loadSchema(): Object {
    return require('./copy-static-assets.schema.json');
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream {
    const rootPath: string = path.join(this.buildConfig.rootPath, this.buildConfig.srcFolder || 'src');
    const libPath: string = path.join(this.buildConfig.rootPath, this.buildConfig.libFolder || 'lib');

    const globPatterns: string[] = [];

    const allExtensions: string[] = (this.taskConfig.includeExtensions || []).concat([
      'json',
      'html',
      'css',
      'md'
    ]);

    for (let ext of allExtensions) {
      if (this.taskConfig.excludeExtensions) {
        if (this.taskConfig.excludeExtensions.indexOf(ext) !== -1) {
          break; // Skipping this extension. It's been excluded
        }
      }

      if (!ext.match(/^\./)) {
        ext = `.${ext}`;
      }

      globPatterns.push(path.join(rootPath, '**', `*${globEscape(ext)}`));
    }

    for (const file of this.taskConfig.includeFiles || []) {
      if (this.taskConfig.excludeFiles) {
        if (this.taskConfig.excludeFiles.indexOf(file) !== -1) {
          break; // Skipping this file. It's been excluded
        }
      }

      globPatterns.push(path.join(rootPath, file));
    }

    for (const file of this.taskConfig.excludeFiles || []) {
      globPatterns.push(`!${path.join(rootPath, file)}`);
    }

    return gulp
      .src(globPatterns, { base: rootPath })
      .pipe(gulp.dest(libPath))
      .on('finish', () => completeCallback());
  }
}
