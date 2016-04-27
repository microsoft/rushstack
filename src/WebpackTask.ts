import * as Webpack from 'webpack';
import { GulpTask } from 'gulp-core-build';
import gulp = require('gulp');

export interface IWebpackTaskConfig {
  /**
   * Path to a webpack config. A path to a config takes precidence over the "config" ooption.
   */
  configPath: string;

  /**
   * Webpack config object. If a path is specified by "configPath," and it is valid, this option is ignored.
   */
  config?: Webpack.Configuration;

  /**
   * An array of regular expressions or regular expression strings. If a warning matches any of them, it
   * will not be logged.
   */
  suppressWarnings?: (string | RegExp)[];
}

export class WebpackTask extends GulpTask<IWebpackTaskConfig> {
  public name = 'webpack';

  public taskConfig: IWebpackTaskConfig = {
    configPath: './webpack.config.js',
    suppressWarnings: []
  };

  public resources = {
    webpack: require('webpack')
  };

  public executeTask(gulp: gulp.Gulp, completeCallback: (result?: any) => void): void {
    let shouldInitWebpack = (process.argv.indexOf('--initwebpack') > -1);
    let path = require('path');

    if (shouldInitWebpack) {
      this.log(
        'Initializing a webpack.config.js, which bundles lib/index.js ' +
        'into dist/packagename.js into a UMD module.');

      this.copyFile(path.resolve(__dirname, '..', 'webpack.config.js'));
      completeCallback();
    } else {
      let webpackConfig = null;

      if (!this.taskConfig.configPath && !this.taskConfig.config) {
        this.logMissingConfigWarning();
        completeCallback();
        return;
      } else if (this.taskConfig.configPath) {
        if (this.fileExists(this.taskConfig.configPath)) {
          try {
            webpackConfig = require(this.resolvePath(this.taskConfig.configPath));
          } catch (err) {
            completeCallback(`Error parsing webpack config: ${ this.taskConfig.configPath }: ${ err }`);
            return;
          }
        } else if (!this.taskConfig.config) {
          let relativeConfigPath = path.relative(this.buildConfig.rootPath, this.taskConfig.config);

          this.logWarning(
            `The webpack config location '${relativeConfigPath}' doesn't exist. ` +
            `Run again using --initwebpack to create a default config, or call ` +
            `webpack.setConfig({ configPath: null }).`);

          completeCallback();
          return;
        } else {
          webpackConfig = this.taskConfig.config;
        }
      } else if (this.taskConfig.config) {
        webpackConfig = this.taskConfig.config;
      } else {
        this.logMissingConfigWarning();
        completeCallback();
        return;
      }

      let webpack = require('webpack');
      let gutil = require('gulp-util');
      let startTime = new Date().getTime();
      let outputDir = this.buildConfig.distFolder;

      webpack(
        webpackConfig,
        (error, stats) => {
          if (!this.buildConfig.properties) {
            this.buildConfig.properties = {};
          }

          /* tslint:disable:no-string-literal */
          this.buildConfig.properties['webpackStats'] = stats;
          /* tslint:enable:no-string-literal */

          let statsResult = stats.toJson({
            hash: false,
            source: false
          });

          if (statsResult.errors && statsResult.errors.length) {
            this.logError(`'${outputDir}':` + '\n' + statsResult.errors.join('\n') + '\n');
          }

          if (statsResult.warnings && statsResult.warnings.length) {
            const unsuppressedWarnings: string[] = [];
            const warningSuppressonRegexes = (this.taskConfig.suppressWarnings || []).map((regex: string) => {
              return new RegExp(regex);
            });

            statsResult.warnings.forEach((warning: string) => {
              let suppressed = false;
              for (let i = 0; i < warningSuppressonRegexes.length; i++) {
                const suppressionRegex = warningSuppressonRegexes[i];
                if (warning.match(suppressionRegex)) {
                  suppressed = true;
                  break;
                }
              }

              if (!suppressed) {
                unsuppressedWarnings.push(warning);
              }
            });

            if (unsuppressedWarnings.length > 0) {
              this.logWarning(`'${outputDir}':` + '\n' + unsuppressedWarnings.join('\n') + '\n');
            }
          }

          let duration = (new Date().getTime() - startTime);
          let statsResultChildren = statsResult.children ? statsResult.children : [ statsResult ];

          statsResultChildren.forEach(child => {
            child.chunks.forEach(chunk => {

              chunk.files.forEach(file => (
                this.log(`Bundled: '${gutil.colors.cyan(path.basename(file))}', ` +
                  `size: ${gutil.colors.magenta(chunk.size)} bytes, ` +
                  `took ${gutil.colors.magenta(duration)} ms.`)
              )); // end file

            }); // end chunk

          }); // end child

          completeCallback();
        }); // endwebpack callback
    }
  }

  private logMissingConfigWarning() {
    this.logWarning(
      'No webpack config has been provided.' +
      'Run again using --initwebpack to create a default config,' +
      `or call webpack.setConfig({ configPath: null }).`);
  }
}