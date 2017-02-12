import * as Webpack from 'webpack';
import { GulpTask, IBuildConfiguration } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import { EOL } from 'os';

export interface IWebpackTaskConfiguration {
  /**
   * Path to a webpack configuration. A path to a configuration takes precidence over the "configuration" option.
   */
  configurationPath: string;

  /**
   * Webpack configuration object. If a path is specified by "configurationPath," and it is valid, this option is
   *  ignored.
   */
  configuration?: Webpack.Configuration;

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

export class WebpackTask extends GulpTask<IWebpackTaskConfiguration> {
  public name: string = 'webpack';

  public taskConfiguration: IWebpackTaskConfiguration = {
    configurationPath: './webpack.config.js',
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

  public isEnabled(buildConfiguration: IBuildConfiguration): boolean {
    return (
      super.isEnabled(buildConfiguration) &&
      this.taskConfiguration.configurationPath !== null // tslint:disable-line:no-null-keyword
    );
  }

  public loadSchema(): Object {
    return require('./webpack.schema.json');
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
      let webpackConfiguration: Object;

      if (this.taskConfiguration.configurationPath && this.fileExists(this.taskConfiguration.configurationPath)) {
        try {
          webpackConfiguration = require(this.resolvePath(this.taskConfiguration.configurationPath));
        } catch (err) {
          completeCallback(`Error parsing webpack configuration: ${this.taskConfiguration.configurationPath}: ${err}`);
          return;
        }
      } else if (this.taskConfiguration.configuration) {
        webpackConfiguration = this.taskConfiguration.configuration;
      } else {
        this._logMissingConfigurationWarning();
        completeCallback();
        return;
      }

      if (webpackConfiguration) {
        const webpack: Webpack.Webpack = this.taskConfiguration.webpack || require('webpack');
        const gutil = require('gulp-util');
        const startTime = new Date().getTime();
        const outputDir = this.buildConfiguration.distFolder;

        webpack(
          webpackConfiguration,
          (error, stats) => {
            if (!this.buildConfiguration.properties) {
              this.buildConfiguration.properties = {};
            }

            /* tslint:disable:no-string-literal */
            this.buildConfiguration.properties['webpackStats'] = stats;
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
              const warningSuppressonRegexes = (this.taskConfiguration.suppressWarnings || []).map((regex: string) => {
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

  private _logMissingConfigurationWarning() {
    this.logWarning(
      'No webpack configuration has been provided. ' +
      'Run again using --initwebpack to create a default configuration, ' +
      `or call webpack.setConfiguration({ configurationPath: null }) in your gulpfile.`);
  }
}
