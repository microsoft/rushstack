import { GulpTask } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
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
  treatAllFilesAsCSSModules?: boolean;
  /**
   * If true, we will generate a CSS in the lib folder. If false, the CSS is directly embedded
   * into the TypeScript file
   */
  dropCssFiles?: boolean;
  /**
   * If files are matched by sassMatch which do not end in .module.scss, throw a warning.
   */
  warnOnNonCSSModules?: boolean;
}

const _classMaps: { [file: string]: Object } = {};

export class SassTask extends GulpTask<ISassTaskConfig> {
  public name: string = 'sass';

  public taskConfig: ISassTaskConfig = {
    preamble: '/* tslint:disable */',
    postamble: '/* tslint:enable */',
    sassMatch: [
      'src/**/*.scss'
    ],
    treatAllFilesAsCSSModules: false,
    dropCssFiles: false,
    warnOnNonCSSModules: false
  };

  public cleanMatch: string[] = [
    'src/**/*.scss.ts'
  ];

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback?: (result?: string) => void
  ): Promise<{}> | NodeJS.ReadWriteStream | void {

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

    console.log('warnOnNonCSSModules: ' + this.taskConfig.warnOnNonCSSModules);

    if (this.taskConfig.treatAllFilesAsCSSModules) {
      this.logVerbose('Generating css modules.');
      return this._processFiles(gulp, srcPattern, completeCallback, modulePostCssPlugins,
        this.taskConfig.warnOnNonCSSModules ? checkFilenameForCSSModule : undefined);
    } else {
      const moduleSrcPattern: string[] = srcPattern.map((value: string) => value.replace('.scss', '.module.scss'));
      moduleSrcPattern.forEach((value: string) => srcPattern.push(`!${value}`));

      return merge(this._processFiles(gulp, srcPattern, completeCallback, postCSSPlugins,
                     this.taskConfig.warnOnNonCSSModules ? checkFilenameForCSSModule : undefined),
                   this._processFiles(gulp, moduleSrcPattern, completeCallback, modulePostCssPlugins));
    }
  }

  private _processFiles(
    gulp: gulp.Gulp,
    srcPattern: string[],
    /* tslint:disable:no-any */
    completeCallback: (result?: any) => void,
    postCSSPlugins: any[],
    /* tslint:enable:no-any */
    checkFile?: (file: gulpUtil.File) => void
  ): NodeJS.ReadWriteStream {
    /* tslint:disable:typedef */
    const changed = require('gulp-changed');
    const cleancss = require('gulp-clean-css');
    const clipEmptyFiles = require('gulp-clip-empty-files');
    const clone = require('gulp-clone');
    const path = require('path');
    const postcss = require('gulp-postcss');
    const sass = require('gulp-sass');
    const texttojs = require('gulp-texttojs');
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

    const baseTask: NodeJS.ReadWriteStream = checkedStream
      .pipe(changed('src', { extension: scssTsExtName }))
      .pipe(sass.sync({
        importer: (url: string, prev: string, done: boolean): Object => ({ file: _patchSassUrl(url) })
      }).on('error', function(error: Error): void {
        sass.logError.call(this, error);
        completeCallback('Errors found in sass file(s).');
      }))
      .pipe(postcss(postCSSPlugins))
      .pipe(cleancss({
        advanced: false
      }))
      .pipe(clipEmptyFiles());

    if (this.taskConfig.dropCssFiles) {
      tasks.push(baseTask.pipe(clone())
        .pipe(gulp.dest(this.buildConfig.libFolder)));
    }

    tasks.push(baseTask.pipe(clone())
      .pipe(texttojs({
        ext: scssTsExtName,
        isExtensionAppended: false,
        template: (file: gulpUtil.File): string => {
          const content: string = file.contents.toString();
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
                this.logWarning(`The local CSS class '${key}' is not camelCase and will not be type-safe.`);
                line = `  '${key}': '${value}'`;
              } else {
                line = `  ${key}: '${value}'`;
              }

              if ((index + 1) <= classKeys.length) {
                line += ',';
              }

              classNamesLines.push(line);
            });

            classNamesLines.push(
              '};',
              '',
              'export default styles;'
            );

            exportClassNames = classNamesLines.join(EOL);
          }

          let lines: string[] = [];

          lines.push(this.taskConfig.preamble || '');

          if (this.taskConfig.dropCssFiles) {
            lines = lines.concat([
              `require('${path.basename(file.path, scssTsExtName)}.css');`,
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

  private generateScopedName(name: string, fileName: string): string {
    /* tslint:disable:typedef */
    const crypto = require('crypto');
    /* tslint:enable:typedef */

    return name + '_' + crypto.createHmac('sha1', fileName).update(name).digest('hex').substring(0, 8);
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
