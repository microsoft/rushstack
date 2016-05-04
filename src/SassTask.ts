import { GulpTask } from 'gulp-core-build';
import gulp = require('gulp');
import { EOL } from 'os';

const scssTsExtName = '.scss.ts';

export interface ISassTaskConfig {
  sassMatch?: string[];
  useCSSModules?: boolean;
  dropCssFiles?: boolean;
}

const _classMaps = {};

const merge = require('merge2');

export class SassTask extends GulpTask<ISassTaskConfig> {
  public name = 'sass';

  public taskConfig: ISassTaskConfig = {
    sassMatch: [
      'src/**/*.scss'
    ],
    useCSSModules: false,
    dropCssFiles: false
  };

  public nukeMatch = [
    'src/**/*.scss.ts'
  ];

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback?: (result?: string) => void
  ): Promise<any> | NodeJS.ReadWriteStream | void {

    const autoprefixer = require('autoprefixer');
    const cssModules = require('postcss-modules');
    const postCSSPlugins = [
      autoprefixer({ browsers: ['> 1%', 'last 2 versions', 'ie >= 10'] })
    ];
    const modulePostCssPlugins = postCSSPlugins.slice(0);

    modulePostCssPlugins.push(cssModules({
      getJSON: this._generateModuleStub.bind(this),
      generateScopedName: this.generateScopedName.bind(this)
    }));

    const srcPattern = this.taskConfig.sassMatch.slice(0);
    const moduleSrcPattern = srcPattern.map((value: string) => value.replace('.scss', '.module.scss'));

    if (this.taskConfig.useCSSModules) {
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
    completeCallback: (result?: any) => void,
    postCSSPlugins: any[]
  ): NodeJS.ReadWriteStream {
    const changed = require('gulp-changed');
    const cleancss = require('gulp-clean-css');
    const clipEmptyFiles = require('gulp-clip-empty-files');
    const clone = require('gulp-clone');
    const path = require('path');
    const postcss = require('gulp-postcss');
    const sass = require('gulp-sass');
    const texttojs = require('gulp-texttojs');
    const tasks: NodeJS.ReadWriteStream[] = [];

    const baseTask = gulp.src(srcPattern)
      .pipe(changed('src', { extension: scssTsExtName }))
      .pipe(sass.sync({
        importer: (url, prev, done) => ({ file: _patchSassUrl(url) })
      }).on('error', function(error: Error) {
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
        template: (file) => {
          const content = file.contents.toString('utf8');
          const classNames: { [key: string]: string } = _classMaps[file.path];
          let exportClassNames: string = '';

          if (classNames) {
            const classNamesLines = [
              '/* tslint:disable */',
              'const styles = {'
            ];

            const classKeys: string[] = Object.keys(classNames);
            classKeys.forEach((key: string, index: number) => {
              const value = classNames[key];
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
              'export default styles;',
              '/* tslint:enable */');

            exportClassNames = classNamesLines.join(EOL);
          }

          let lines = [];
          if (this.taskConfig.dropCssFiles) {
            lines = [
              `require('${path.basename(file.path, scssTsExtName)}.css');`,
              '',
              exportClassNames,
              ''
            ];
          } else if (!!content) {
            lines = [
              'import { loadStyles } from \'load-themed-styles\';',
              '',
              exportClassNames,
              '',
              `loadStyles(${_flipDoubleQuotes(JSON.stringify(content))});`,
              ''
            ];
          }

          return lines.join(EOL).replace(new RegExp(`${EOL}${EOL}+`), `${EOL}${EOL}`);
        }
      }))
      .pipe(gulp.dest('src')));

    return merge(tasks);
  }

  private _generateModuleStub(cssFileName: string, json: any) {
    cssFileName = cssFileName.replace('.css', '.scss.ts');
    _classMaps[cssFileName] = json;
  }

  private generateScopedName(name: string, fileName: string ) {
    const crypto = require('crypto');

    return name + '_' + crypto.createHmac('sha1', fileName).update(name).digest('hex').substring(0, 8);
  }
}

function _patchSassUrl(url: string) {
  if (url[0] === '~') {
    url = 'node_modules/' + url.substr(1);
  } else if (url === 'stdin') {
    url = '';
  }

  return url;
}

function _flipDoubleQuotes(str: string) {
  return str ? (
    str
      .replace(/\\"/g, '`')
      .replace(/'/g, '\\\'')
      .replace(/"/g, `'`)
      .replace(/`/g, '"')
  ) : str;
}
