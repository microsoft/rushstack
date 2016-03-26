import {
GulpTask
} from 'gulp-core-build';

export interface IKarmaTaskConfig {
  karmaConfigPath: string;
}

export class KarmaTask extends GulpTask<IKarmaTaskConfig> {
  public name = 'karma';
  public taskConfig: IKarmaTaskConfig = {
    karmaConfigPath: './karma.config.js'
  };

  public resources = {
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

  public executeTask(gulp, completeCallback): any {
    let { karmaConfigPath } = this.taskConfig;

    if (!this.fileExists(karmaConfigPath)) {
      let shouldInitKarma = (process.argv.indexOf('--initkarma') > -1);

      if (!shouldInitKarma) {
        this.logWarning(
          `The karma config location '${ karmaConfigPath }' doesn't exist. ` +
          `Run again using --initkarma to create a default config.`);
      } else {
        let path = require('path');

        this.copyFile(path.resolve(__dirname, '../karma.config.js'));
        this.copyFile(path.resolve(__dirname, '../tests.js'), 'src/tests.js');

        // install dev dependencies?
        // phantomjs-polyfill?
        //
        // install typings for mocha/chai/sinon?
      }

      completeCallback();
    } else {
      let server = require('karma').Server;
      let singleRun = (process.argv.indexOf('--debug') === -1);
      let matchIndex = (process.argv.indexOf('--match'));
      let matchString = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];

      new server({
        client: {
          mocha: {
            grep: matchString
          }
        },
        configFile: this.resolvePath(karmaConfigPath),
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
