import {
  GulpTask
} from 'gulp-core-build';

const clone = require('gulp-clone');
const merge = require('merge2');

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
      return this.processFiles(gulp, srcPattern, completeCallback, modulePostCssPlugins);
    } else {
      moduleSrcPattern.forEach((value: string) => srcPattern.push(`!${value}`));

      return merge(this.processFiles(gulp, srcPattern, completeCallback, postCSSPlugins),
                   this.processFiles(gulp, moduleSrcPattern, completeCallback, modulePostCssPlugins));
    }
  }

  private processFiles(gulp, srcPattern, completeCallback, postCSSPlugins): NodeJS.ReadWriteStream {
    const cleancss = require('gulp-clean-css');
    const changed = require('gulp-changed');
    const sass = require('gulp-sass');
    const postcss = require('gulp-postcss');
    const texttojs = require('gulp-texttojs');
    const path = require('path');

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
          const classNames = _classMaps[file.path];
          const exportClassNames = classNames ?
            `export = ${flipDoubleQuotes(JSON.stringify(classNames, null, 2))};` : '';

          let lines = [];
          if (this.taskConfig.dropCssFiles) {
            lines = [
              '/* tslint:disable */',
              '',
              exportClassNames,
              '',
              `require('${path.basename(file.path, scssTsExtName)}.css');`,
              ''
            ];
          } else if (!!content) {
            lines = [
              '/* tslint:disable */',
              '',
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