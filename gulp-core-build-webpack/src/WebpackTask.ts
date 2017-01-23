import * as Webpack from 'webpack';
import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import { EOL } from 'os';

export interface IWebpackTaskConfig {
  /**
   * Path to a webpack config. A path to a config takes precidence over the "config" option.
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

  /**
   * An instance of the webpack compiler object, useful for building with Webpack 2.X while GCB is still on 1.X.
   */
  webpack?: typeof Webpack;
}

export class WebpackTask extends GulpTask<IWebpackTaskConfig> {
  public name: string = 'webpack';

  public taskConfig: IWebpackTaskConfig = {
    configPath: './webpack.config.js',
    suppressWarnings: []
  };

  public get resources(): Object {
    if (!this._resources) {
      this._resources = {
        webpack: require('webpack')
      };
    }
    return this._resources;
  }

  private _resources: Object;

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (
      super.isEnabled(buildConfig) &&
      this.taskConfig.configPath !== null // tslint:disable-line:no-null-keyword
    );
  }

  public executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void {
    const shouldInitWebpack: boolean = (process.argv.indexOf('--initwebpack') > -1);

    /* tslint:disable:typedef */
    const path = require('path');
    /* tslint:enabled:typedef */

    if (shouldInitWebpack) {
      this.log(
        'Initializing a webpack.config.js, which bundles lib/index.js ' +
        'into dist/packagename.js into a UMD module.');

      this.copyFile(path.resolve(__dirname, '..', 'webpack.config.js'));
      completeCallback();
    } else {
      let webpackConfig: Object;

      if (this.taskConfig.configPath && this.fileExists(this.taskConfig.configPath)) {
        try {
          webpackConfig = require(this.resolvePath(this.taskConfig.configPath));
        } catch (err) {
          completeCallback(`Error parsing webpack config: ${this.taskConfig.configPath}: ${err}`);
          return;
        }
      } else if (this.taskConfig.config) {
        webpackConfig = this.taskConfig.config;
      } else {
        this._logMissingConfigWarning();
        completeCallback();
        return;
      }

      if (webpackConfig) {
        const webpack: Webpack.Webpack = this.taskConfig.webpack || require('webpack');
        const gutil = require('gulp-util');
        const startTime = new Date().getTime();
        const outputDir = this.buildConfig.distFolder;

        webpack(
          webpackConfig,
          (error, stats) => {
            if (!this.buildConfig.properties) {
              this.buildConfig.properties = {};
            }

            /* tslint:disable:no-string-literal */
            this.buildConfig.properties['webpackStats'] = stats;
            /* tslint:enable:no-string-literal */

            const statsResult = stats.toJson({
              hash: false,
              source: false
            });

            if (statsResult.errors && statsResult.errors.length) {
              this.logError(`'${outputDir}':` + EOL + statsResult.errors.join(EOL) + EOL);
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
                this.logWarning(`'${outputDir}':` + EOL + unsuppressedWarnings.join(EOL) + EOL);
              }
            }

            const duration = (new Date().getTime() - startTime);
            const statsResultChildren = statsResult.children ? statsResult.children : [statsResult];

            statsResultChildren.forEach(child => {
              if (child.chunks) {
                child.chunks.forEach(chunk => {
                  if (chunk.files) {
                    chunk.files.forEach(file => (
                      this.log(`Bundled: '${gutil.colors.cyan(path.basename(file))}', ` +
                        `size: ${gutil.colors.magenta(chunk.size)} bytes, ` +
                        `took ${gutil.colors.magenta(duration)} ms.`)
                    )); // end file
                  }
                }); // end chunk
              }
            }); // end child

            completeCallback();
          }); // endwebpack callback
      }
    }
  }

  private _logMissingConfigWarning() {
    this.logWarning(
      'No webpack config has been provided. ' +
      'Run again using --initwebpack to create a default config, ' +
      `or call webpack.setConfig({ configPath: null }) in your gulpfile.`);
  }
}
