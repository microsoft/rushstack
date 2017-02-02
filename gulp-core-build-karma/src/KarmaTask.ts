import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';

import * as os from 'os';
import * as fs from 'fs';
import * as gulp from 'gulp';
import * as path from 'path';
import * as KarmaType from 'karma';

export interface IKarmaTaskConfig {
  configPath: string;

  /**
   * If specified, a "tests.js" file will be created in the temp folder using
   *  this RegExp to locate test files.
   */
  testMatch?: RegExp | string;
}

export class KarmaTask extends GulpTask<IKarmaTaskConfig> {
  public name: string = 'karma';

  public taskConfig: IKarmaTaskConfig = {
    configPath: './karma.config.js',
    testMatch: /.+\.test\.js?$/
  };

  public get resources(): Object {
    if (!this._resources) {
      this._resources = {
        bindPolyfillPath: require.resolve('phantomjs-polyfill/bind-polyfill.js'),
        istanbulInstrumenterLoaderPath: require.resolve('istanbul-instrumenter-loader'),
        plugins: [
          require('karma-webpack'),
          require('karma-mocha'),
          require('karma-coverage'),
          require('karma-mocha-clean-reporter'),
          require('karma-phantomjs-launcher'),
          require('karma-sinon-chai')
        ]
      };
    }

    return this._resources;
  }

  private _resources: Object;

  public loadSchema(): Object {
    return require('./karma.schema.json');
  }

  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: IKarmaTaskConfig = this.taskConfig): string[] {
    return [
      path.join(buildConfig.tempFolder, 'tests.js')
    ];
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (
      super.isEnabled(buildConfig) &&
      this.taskConfig.configPath !== null // tslint:disable-line:no-null-keyword
    );
  }

  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: Error | string) => void): void {
    const { configPath }: IKarmaTaskConfig = this.taskConfig;

    if (configPath && !this.fileExists(configPath)) {
      const shouldInitKarma: boolean = (process.argv.indexOf('--initkarma') > -1);

      if (!shouldInitKarma) {
        this.logWarning(
          `No karma config has been provided. ` +
          `Run again using --initkarma to create a default config, or call ` +
          `karma.setConfig({ configPath: null }) in your gulpfile.`);
      } else {
        this.copyFile(path.resolve(__dirname, '../karma.config.js'));

        // install dev dependencies?
        // phantomjs-polyfill?
        //
        // install typings for mocha/chai/sinon?
      }

      completeCallback();
    } else {
      // Normalize the match expression if one was specified
      const { testMatch }: IKarmaTaskConfig = this.taskConfig;
      if (testMatch) {
        let normalizedMatch: RegExp;

        if (typeof testMatch === 'string') {
          try {
            normalizedMatch = new RegExp(testMatch as string);
          } catch (error) {
            completeCallback('There was an issue parsing your testMatch regular expression: ' + error.toString());
            return;
          }
        } else if (testMatch instanceof RegExp) {
          normalizedMatch = testMatch;
        } else {
          completeCallback('The testMatch regular expression is invalid');
          return;
        }

        // tslint:disable:max-line-length
        const testsJsFileContents: string = [
          `var context = require.context('${path.posix.join('..', this.buildConfig.libFolder)}', true, ${normalizedMatch.toString()});`,
          `context.keys().forEach(context);`,
          `module.exports = context;`
        ].join(os.EOL);
        // tslint:enable:max-line-length

        const tempFolder: string = path.join(this.buildConfig.rootPath, this.buildConfig.tempFolder);
        if (!fs.existsSync(tempFolder)) {
          fs.mkdirSync(tempFolder);
        }
        fs.writeFileSync(path.join(tempFolder, 'tests.js'), testsJsFileContents);
      }

      const karma: typeof KarmaType = require('karma'); // tslint:disable-line
      const server: KarmaType.Server = karma.Server;
      const singleRun: boolean = (process.argv.indexOf('--debug') === -1);
      const matchIndex: number = (process.argv.indexOf('--match'));
      const matchString: string = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];

      new server({
        client: {
          mocha: {
            grep: matchString
          }
        },
        configFile: this.resolvePath(configPath),
        singleRun: singleRun
      }, (exitCode) => {
        if (exitCode) {
          completeCallback('Error(s) occured during karma.');
        } else {
          completeCallback();
        }
      }).start();
    }
  }
}
