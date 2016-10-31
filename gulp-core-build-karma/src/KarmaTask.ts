import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';

import * as gulp from 'gulp';
import * as karma from 'karma';
import * as path from 'path';

export interface IKarmaTaskConfig {
  configPath: string;
}

export class KarmaTask extends GulpTask<IKarmaTaskConfig> {
  public name: string = 'karma';
  public taskConfig: IKarmaTaskConfig = {
    configPath: './karma.config.js'
  };

  public resources: Object = {
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

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (
      super.isEnabled(buildConfig) &&
      this.taskConfig.configPath !== null // tslint:disable-line:no-null-keyword
    );
  }

  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: Error | string) => void): void {
    const { configPath }: IKarmaTaskConfig = this.taskConfig;

    if (!this.fileExists(configPath)) {
      const shouldInitKarma: boolean = (process.argv.indexOf('--initkarma') > -1);

      if (!shouldInitKarma) {
        this.logWarning(
          `No karma config has been provided. ` +
          `Run again using --initkarma to create a default config, or call ` +
          ` karma.setConfig({ configPath: null }) in your gulpfile.`);
      } else {
        this.copyFile(path.resolve(__dirname, '../karma.config.js'));
        this.copyFile(path.resolve(__dirname, '../tests.js'), 'src/tests.js');

        // install dev dependencies?
        // phantomjs-polyfill?
        //
        // install typings for mocha/chai/sinon?
      }

      completeCallback();
    } else {
      const server: karma.Server = karma.Server;
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
