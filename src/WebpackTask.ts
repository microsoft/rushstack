import { GulpTask } from 'gulp-core-build';

export interface IWebpackConfig {
  configPaths: string[];
}

export class WebpackTask extends GulpTask<IWebpackConfig> {
  public name = 'webpack';

  public taskConfig: IWebpackConfig = {
    configPaths: ['./webpack.config.js']
  };

  public executeTask(gulp, completeCallback): any {
    // let isProduction = (process.argv.indexOf('--production') > -1);
    // let streams = [];
    let completeEntries = 0;

    if (completeEntries === this.taskConfig.configPaths.length) {
      completeCallback();
    } else {

      for (let configPath of this.taskConfig.configPaths) {
        configPath = this.resolvePath(configPath);

        if (!this.fileExists(configPath)) {
          let path = require('path');
          let relativeConfigPath = path.relative(this.buildConfig.rootPath, configPath);

          this.logWarning(`The webpack config location '${relativeConfigPath}' doesn't exist.`);
          completeEntries++;
        } else {
          let webpack = require('webpack');
          let path = require('path');
          let gutil = require('gulp-util');

          let webpackConfig = require(configPath);
          let startTime = new Date().getTime();
          let outputDir = this.buildConfig.distFolder;

          webpack(
            webpackConfig,
            (error, stats) => {
              let statsResult = stats.toJson({
                hash: false,
                source: false
              });

              if (statsResult.errors && statsResult.errors.length) {
                this.logError(`'${outputDir}':` + '\n' + statsResult.errors.join('\n') + '\n');
              }

              if (statsResult.warnings && statsResult.warnings.length) {
                this.logWarning(`'${outputDir}':` + '\n' + statsResult.warnings.join('\n') + '\n');
              }

              completeEntries++;

              let duration = (new Date().getTime() - startTime);

              statsResult.chunks.forEach(chunk => chunk.files.forEach(file => (
                this.log(`Bundled: '${gutil.colors.cyan(path.basename(file))}', ` +
                  `size: ${gutil.colors.magenta(chunk.size)} bytes, ` +
                  `took ${gutil.colors.magenta(duration)} ms.`)
              )));

              let chunk;

              for (let i = 0; i < statsResult.chunks.length; i++) {
                let chunkStats = {
                  chunk: null,
                  modules: null
                };

                chunkStats.chunk = chunk = statsResult.chunks[i];

                let statsPath = path.join(outputDir, chunk.files[0]) + '.stats.json';

                if (statsResult.modules) {
                  chunkStats.modules = statsResult.modules
                    .filter(mod => (mod.chunks && mod.chunks.indexOf(chunk.id) > -1))
                    .map(mod => ({ name: mod.name, size: mod.size }))
                    .sort((a, b) => (a.size < b.size ? 1 : -1));
                }

                let fs = require('fs');

                fs.writeFileSync(
                  statsPath,
                  JSON.stringify(chunkStats, null, 2),
                  'utf8'
                );
              }
            });
        }

        if (completeEntries === this.taskConfig.configPaths.length) {
          completeCallback();
        }

      }
    }
  }
}
