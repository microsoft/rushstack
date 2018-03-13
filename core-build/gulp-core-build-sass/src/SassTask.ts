// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from '@microsoft/gulp-core-build';
import * as Gulp from 'gulp';
import * as gulpUtil from 'gulp-util';
import { EOL } from 'os';
import { splitStyles } from '@microsoft/load-themed-styles';
import through2 = require('through2');
import * as path from 'path';
/* tslint:disable:typedef */
const merge = require('merge2');
/* tslint:enable:typedef */

const scssTsExtName: string = '.scss.ts';

export interface ISassTaskConfig {
  /** An optional parameter for text to include in the generated typescript file. */
  preamble?: string;
  /** An optional parameter for text to include at the end of the generated typescript file. */
  postamble?: string;
  /** An array of glob patterns for locating SASS files. */
  sassMatch?: string[];
  /**
   * If this option is specified, ALL files will be treated as a module.scss and will
   * automatically generate a corresponding TypeScript file. All classes will be
   * appended with a hash to help ensure uniqueness on a page. This file can be
   * imported directly, and will contain an object describing the mangled class names.
   */
  useCSSModules?: boolean;
  /**
   * If false, we will set the CSS property naming warning to verbose message while the module is generating
   * to prevent task exit with exitcode: 1.
   * Default value is true
   */
  warnOnCssInvalidPropertyName?: boolean;
  /**
   * If true, we will generate a CSS in the lib folder. If false, the CSS is directly embedded
   * into the TypeScript file
   */
  dropCssFiles?: boolean;
  /**
   * If files are matched by sassMatch which do not end in .module.scss, log a warning.
   */
  warnOnNonCSSModules?: boolean;
  /**
   * If this option is specified, module css will be exported using the name provided. If an
   * empty value is specified, the styles will be exported using 'export =', rather than a
   * named export. By default we use the 'default' export name.
   */
  moduleExportName?: string;
}

const _classMaps: { [file: string]: Object } = {};

export class SassTask extends GulpTask<ISassTaskConfig> {
  public cleanMatch: string[] = [
    'src/**/*.scss.ts'
  ];

  constructor() {
    super(
      'sass',
      {
        preamble: '/* tslint:disable */',
        postamble: '/* tslint:enable */',
        sassMatch: [
          'src/**/*.scss'
        ],
        useCSSModules: false,
        warnOnCssInvalidPropertyName: true,
        dropCssFiles: false,
        warnOnNonCSSModules: false
      }
    );
  }

  public loadSchema(): Object {
    return require('./sass.schema.json');
  }

  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string) => void
  ): Promise<{}> | NodeJS.ReadWriteStream | void {

    if (!this.taskConfig.sassMatch) {
      completeCallback('taskConfig.sassMatch must be defined');
      return;
    }

    /* tslint:disable:typedef */
    const autoprefixer = require('autoprefixer');
    const cssModules = require('postcss-modules');
    /* tslint:enable:typedef */

    /* tslint:disable:no-any */
    const postCSSPlugins: any[] = [
      autoprefixer({ browsers: ['> 1%', 'last 2 versions', 'ie >= 10'] })
    ];
    const modulePostCssPlugins: any[] = postCSSPlugins.slice(0);
    /* tslint:enable:no-any */

    modulePostCssPlugins.push(cssModules({
      getJSON: this._generateModuleStub.bind(this),
      generateScopedName: this.generateScopedName.bind(this)
    }));

    const srcPattern: string[] = this.taskConfig.sassMatch.slice(0);

    const checkFilenameForCSSModule: (file: gulpUtil.File) => void = (file: gulpUtil.File) => {
      if (!path.basename(file.path).match(/module\.scss$/)) {

        const filepath: string = path.relative(this.buildConfig.rootPath, file.path);
        this.logWarning(`${filepath}: filename should end with module.scss`);
      }
    };

    if (this.taskConfig.useCSSModules) {
      this.logVerbose('Generating css modules.');
      return this._processFiles(gulp, srcPattern, completeCallback, modulePostCssPlugins);
    } else {
      const moduleSrcPattern: string[] = srcPattern.map((value: string) => value.replace('.scss', '.module.scss'));
      moduleSrcPattern.forEach((value: string) => srcPattern.push(`!${value}`));

      return merge(this._processFiles(gulp, srcPattern, completeCallback, postCSSPlugins,
        this.taskConfig.warnOnNonCSSModules ? checkFilenameForCSSModule : undefined),
        this._processFiles(gulp, moduleSrcPattern, completeCallback, modulePostCssPlugins));
    }
  }

  private _processFiles(
    gulp: typeof Gulp,
    srcPattern: string[],
    /* tslint:disable:no-any */
    completeCallback: (error?: string) => void,
    postCSSPlugins: any[],
    /* tslint:enable:no-any */
    checkFile?: (file: gulpUtil.File) => void
  ): NodeJS.ReadWriteStream {
    /* tslint:disable:typedef */
    const cleancss = require('gulp-clean-css');
    const clipEmptyFiles = require('gulp-clip-empty-files');
    const clone = require('gulp-clone');
    const postcss = require('gulp-postcss');
    const sass = require('gulp-sass');
    const texttojs = require('gulp-texttojs');
    const sourcemaps = require('gulp-sourcemaps');
    /* tslint:enable:typedef */

    const tasks: NodeJS.ReadWriteStream[] = [];

    const srcStream: NodeJS.ReadWriteStream = gulp.src(srcPattern);

    const checkedStream: NodeJS.ReadWriteStream = (checkFile ?
      srcStream.pipe(through2.obj(
        // tslint:disable-next-line:no-function-expression
        function (file: gulpUtil.File, encoding: string, callback: (p?: Object) => void): void {
          // tslint:disable-next-line:no-unused-expression

          checkFile(file);
          this.push(file);
          callback();
        }
      ))
      : srcStream);

    let baseTask: NodeJS.ReadWriteStream = checkedStream;
    if (!this.buildConfig.production) {
      baseTask = baseTask.pipe(sourcemaps.init());
    }

    baseTask = baseTask
      .pipe(sass.sync({
        importer: (url: string, prev: string, done: boolean): Object => ({ file: _patchSassUrl(url) })
      }).on('error', function (error: Error): void {
        sass.logError.call(this, error);
        completeCallback('Errors found in sass file(s).');
      }))
      .pipe(postcss(postCSSPlugins))
      .pipe(cleancss({
        advanced: false
      }))
      .pipe(clipEmptyFiles());

    if (!this.buildConfig.production) {
      baseTask = baseTask.pipe(sourcemaps.write());
    }

    if (this.taskConfig.dropCssFiles) {
      tasks.push(baseTask.pipe(clone()).pipe(gulp.dest(this.buildConfig.libFolder)));
    }

    tasks.push(baseTask.pipe(clone())
      .pipe(texttojs({
        ext: scssTsExtName,
        isExtensionAppended: false,
        template: (file: gulpUtil.File): string => {
          const content: string = file.contents!.toString();
          const classNames: Object = _classMaps[file.path];
          let exportClassNames: string = '';

          if (classNames) {
            const classNamesLines: string[] = [
              'const styles = {'
            ];

            const classKeys: string[] = Object.keys(classNames);
            classKeys.forEach((key: string, index: number) => {
              const value: string = classNames[key];
              let line: string = '';
              if (key.indexOf('-') !== -1) {
                const message: string = `The local CSS class '${key}' is not camelCase and will not be type-safe.`;
                this.taskConfig.warnOnCssInvalidPropertyName ?
                  this.logWarning(message) :
                  this.logVerbose(message);
                line = `  '${key}': '${value}'`;
              } else {
                line = `  ${key}: '${value}'`;
              }

              if ((index + 1) <= classKeys.length) {
                line += ',';
              }

              classNamesLines.push(line);
            });

            let exportString: string = 'export default styles;';

            if (this.taskConfig.moduleExportName === '') {
              exportString = 'export = styles;';
            } else if (!!this.taskConfig.moduleExportName) {
              exportString = `export const ${this.taskConfig.moduleExportName} = styles;`;
            }

            classNamesLines.push(
              '};',
              '',
              exportString
            );

            exportClassNames = classNamesLines.join(EOL);
          }

          let lines: string[] = [];

          lines.push(this.taskConfig.preamble || '');

          if (this.taskConfig.dropCssFiles) {
            lines = lines.concat([
              `require('./${path.basename(file.path, scssTsExtName)}.css');`,
              exportClassNames
            ]);
          } else if (!!content) {
            lines = lines.concat([
              'import { loadStyles } from \'@microsoft/load-themed-styles\';',
              '',
              exportClassNames,
              '',
              `loadStyles(${JSON.stringify(splitStyles(content))});`
            ]);
          }

          lines.push(this.taskConfig.postamble || '');

          return (
            lines
              .join(EOL)
              .replace(new RegExp(`(${EOL}){3,}`, 'g'), `${EOL}${EOL}`)
              .replace(new RegExp(`(${EOL})+$`, 'm'), EOL)
          );
        }
      }))
      .pipe(gulp.dest('src')));

    return merge(tasks);
  }

  private _generateModuleStub(cssFileName: string, json: Object): void {
    cssFileName = cssFileName.replace('.css', '.scss.ts');
    _classMaps[cssFileName] = json;
  }

  private generateScopedName(name: string, fileName: string, css: string): string {
    /* tslint:disable:typedef */
    const crypto = require('crypto');
    /* tslint:enable:typedef */

    return name + '_' + crypto.createHmac('sha1', fileName).update(css).digest('hex').substring(0, 8);
  }
}

function _patchSassUrl(url: string): string {
  if (url[0] === '~') {
    url = 'node_modules/' + url.substr(1);
  } else if (url === 'stdin') {
    url = '';
  }

  return url;
}
