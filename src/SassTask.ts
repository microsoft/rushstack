import {
  GulpTask
} from 'gulp-core-build';

const scssTsExtName = '.scss.ts';

export interface ISassTaskConfig {
  sassMatch?: string[];
  useCSSModules?: boolean;
  dropCssFiles?: boolean;
}

const _classMaps = {};

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

  public executeTask(gulp, completeCallback): any {
    const merge = require('merge2');
    const autoprefixer = require('autoprefixer');
    const cssModules = require('postcss-modules');

    const postCSSPlugins = [
      autoprefixer({ browsers: ['> 1%', 'last 2 versions', 'ie >= 10'] })
    ];
    const modulePostCssPlugins = postCSSPlugins.slice(0);
    modulePostCssPlugins.push(cssModules({
      getJSON: this.generateModuleStub.bind(this),
      generateScopedName: this.generateScopedName.bind(this)
    }));

    const srcPattern = this.taskConfig.sassMatch.slice(0);
    const moduleSrcPattern = srcPattern.map((value: string) => value.replace('.scss', '.module.scss'));

    if (this.taskConfig.useCSSModules) {
      return this.processFiles(gulp, merge, srcPattern, completeCallback, modulePostCssPlugins);
    } else {
      moduleSrcPattern.forEach((value: string) => srcPattern.push(`!${value}`));

      return merge(this.processFiles(gulp, merge, srcPattern, completeCallback, postCSSPlugins),
                   this.processFiles(gulp, merge, moduleSrcPattern, completeCallback, modulePostCssPlugins));
    }
  }

  private processFiles(gulp, merge, srcPattern, completeCallback, postCSSPlugins): NodeJS.ReadWriteStream {
    const changed = require('gulp-changed');
    const cleancss = require('gulp-clean-css');
    const clone = require('gulp-clone');
    const path = require('path');
    const postcss = require('gulp-postcss');
    const sass = require('gulp-sass');
    const texttojs = require('gulp-texttojs');

    const tasks: NodeJS.ReadWriteStream[] = [];

    const baseTask = gulp.src(srcPattern)
      .pipe(changed('src', { extension: scssTsExtName }))
      .pipe(sass.sync({
        importer: (url, prev, done) => ({ file: patchSassUrl(url) })
      }).on('error', function(error) {
        sass.logError.call(this, error);
        completeCallback('Errors found in sass file(s).');
      }))
      .pipe(postcss(postCSSPlugins))
      .pipe(cleancss({
        advanced: false
      }));

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
            const nonCamelCaseKeys: string[] = [];
            const classNamesLines = [
              'export class Styles {'
            ];

            Object.keys(classNames).forEach((key: string) => {
              const value = classNames[key];
              if (key.indexOf('-') !== -1) {
                this.logWarning(`The local CSS class '${key}' is not camelCase and will not be type-safe.`);
                nonCamelCaseKeys.push(key);
              } else {
                classNamesLines.push(`  public ${key}: string = '${value}';`);
              }
            });

            classNamesLines.push('}');
            classNamesLines.push('');
            classNamesLines.push('const styles = new Styles();');

            if (nonCamelCaseKeys.length !== 0) {
              classNamesLines.push('/* tslint:disable */');

              nonCamelCaseKeys.forEach((key: string) => {
                const value: string = classNames[key];
                classNamesLines.push(`styles['${key}'] = '${value}';`);
              });

              classNamesLines.push('/* tslint:enable */');
            }

            classNamesLines.push('');
            classNamesLines.push('export default styles');

            exportClassNames = classNamesLines.join('\n');
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
              `loadStyles(${flipDoubleQuotes(JSON.stringify(content))});`,
              ''
            ];
          }

          return lines.join('\n').replace(/\n\n+/, '\n\n');
        }
      }))
      .pipe(gulp.dest('src')));

    return merge(tasks);
  }

  private generateModuleStub(cssFileName, json) {
    cssFileName = cssFileName.replace('.css', '.scss.ts');
    _classMaps[cssFileName] = json;
  }

  private generateScopedName(name, fileName, css) {
    const crypto = require('crypto');

    return name + '_' + crypto.createHmac('sha1', fileName).update(name).digest('hex').substring(0, 8);
  }
}

function patchSassUrl(url) {
  if (url[0] === '~') {
    url = 'node_modules/' + url.substr(1);
  } else if (url === 'stdin') {
    url = '';
  }

  return url;
}

function flipDoubleQuotes(str: string) {
  return str ? (
    str
      .replace(/\\"/g, '`')
      .replace(/'/g, '\\\'')
      .replace(/"/g, `'`)
      .replace(/`/g, '"')
  ) : str;
}