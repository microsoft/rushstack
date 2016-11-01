import { GulpTask } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import * as gulpUtil from 'gulp-util';
import { EOL } from 'os';
import { splitStyles } from '@microsoft/load-themed-styles';
/* tslint:disable:typedef */
const merge = require('merge2');
/* tslint:enable:typedef */

const scssTsExtName: string = '.scss.ts';

export interface ISassTaskConfig {
  preamble?: string;
  postamble?: string;
  sassMatch?: string[];
  useCSSModules?: boolean;
  dropCssFiles?: boolean;
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
    useCSSModules: false,
    dropCssFiles: false
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
    const moduleSrcPattern: string[] = srcPattern.map((value: string) => value.replace('.scss', '.module.scss'));

    if (this.taskConfig.useCSSModules) {
      this.logVerbose('Generating css modules.');
      return this._processFiles(gulp, srcPattern, completeCallback, modulePostCssPlugins);
    } else {
      moduleSrcPattern.forEach((value: string) => srcPattern.push(`!${value}`));

      return merge(this._processFiles(gulp, srcPattern, completeCallback, postCSSPlugins),
                   this._processFiles(gulp, moduleSrcPattern, completeCallback, modulePostCssPlugins));
    }
  }

  private _processFiles(
    gulp: gulp.Gulp,
    srcPattern: string[],
    /* tslint:disable:no-any */
    completeCallback: (result?: any) => void,
    postCSSPlugins: any[]
    /* tslint:enable:no-any */
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

    const baseTask: NodeJS.ReadWriteStream = gulp.src(srcPattern)
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
