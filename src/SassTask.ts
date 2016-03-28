import {
  GulpTask
} from 'gulp-core-build';

export interface ISassTaskConfig {
  sassMatch?: string[];
  commonModuleTemplate?: string;
  amdModuleTemplate?: string;
  useCSSModules?: boolean;
}

let _classMaps = {};

export class SassTask extends GulpTask<ISassTaskConfig> {
  public name = 'sass';

  public taskConfig: ISassTaskConfig = {
    sassMatch: [
      'src/**/*.scss'
    ],
    commonModuleTemplate:
    `require('load-themed-styles').loadStyles(<%= content %>);`,
    amdModuleTemplate:
    `define(['load-themed-styles'], function(loadStyles) { loadStyles.loadStyles(<%= content %>); });`,
    useCSSModules: false
  };

  public nukeMatch = [
    'src/**/*.scss.ts'
  ];

  public executeTask(gulp, completeCallback): any {
    let sass = require('gulp-sass');
    let cleancss = require('gulp-clean-css');
    let texttojs = require('gulp-texttojs');
    let changed = require('gulp-changed');
    let postcss = require('gulp-postcss');
    let autoprefixer = require('autoprefixer');
    let cssModules = require('postcss-modules');
    let postCSSPlugins = [
        autoprefixer({ browsers: ['> 1%', 'last 2 versions', 'ie >= 10'] })
    ];

    if (this.taskConfig.useCSSModules) {
      postCSSPlugins.push(
        cssModules({
          getJSON: this.generateModuleStub.bind(this),
          generateScopedName: this.generateScopedName.bind(this)
        })
      );
    }

    return gulp.src(this.taskConfig.sassMatch)
      .pipe(changed('src', { extension: '.scss.ts' }))
      .pipe(sass.sync({
        importer: (url, prev, done) => ({ file: patchSassUrl(url) })
      }).on('error', function(error) {
        sass.logError.call(this, error);
        completeCallback('Errors found in sass file(s).');
      }))
      .pipe(postcss(postCSSPlugins))
      .pipe(cleancss({
        advanced: false
      }))
      .pipe(texttojs({
        ext: '.scss.ts',
        isExtensionAppended: false,
        template: (file) => {
          let content = file.contents.toString('utf8');
          let classNames = _classMaps[file.path];

          return (
            !!content ?
              `/* tslint:disable */` + '\n\n' +
              `import { loadStyles } from 'load-themed-styles';` + '\n\n' +
              (classNames ?
                `export = ${ flipDoubleQuotes(JSON.stringify(classNames, null, 2)) };` + '\n\n'
              : '') +
              `loadStyles(${ flipDoubleQuotes(JSON.stringify(content)) });` + '\n'
            : '');
        }
      }))
      .pipe(gulp.dest('src'));
  }

  private generateModuleStub(cssFileName, json) {
    cssFileName = cssFileName.replace('.css', '.scss.ts');
    _classMaps[cssFileName] = json;
  }

  private generateScopedName(name, fileName, css) {
    let crypto = require('crypto');

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