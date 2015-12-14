/// <reference path="../../typings/tsd" />

import { IBundleOptions } from '../options/bundle';

let _ = require('lodash');
let fs = require('fs');
let path = require('path');
let shouldMinify = process.argv.indexOf('--production') > -1;
let resolve = require('resolve');
let chalk = require('chalk');

export default class BundleTasks {
  public static registerTasks(build: any, options: IBundleOptions) {
    let gulp = build.gulp;

    build.task('bundle', [ 'build' ], (cb) => {
      if (options.entries && options.entries.length) {
        let completeEntries = 0;
        let inProgressConfigs = {};
        let bundles = {};

        options.entries.forEach(bundle => {
          let builder = new (require('systemjs-builder'))('');

          bundle.config = _.merge(
            {},
            options.config,
            bundle.config
          );

          // Build bundle config.
          let bundleConfig = _.merge(
            {},
            BundleTasks._getDefaultBundleConfig(build, bundle),
            bundle.config);

          let outputConfigPath = bundle.configPath;
          let entryLocation = BundleTasks._getEntryLocation(bundle);
          let outputLocation = path.resolve(build.rootDir, bundle.outputPath);
          let startTime = new Date().getTime();

          if (outputConfigPath) {
            inProgressConfigs[outputConfigPath] = (inProgressConfigs[outputConfigPath] || 0) + 1;
          }

          builder.config(bundleConfig);

          build.logVerbose(chalk.magenta(`Bundle config for ${ bundle.outputPath }:`));
          build.logVerbose(JSON.stringify(bundleConfig, null, 2));

          builder[bundle.isStandalone ? 'buildStatic' : 'bundle'](entryLocation, outputLocation, {
            minify: shouldMinify,
            format: 'amd'
          }).then(output => {

            if (outputConfigPath) {
              bundles[outputConfigPath] = bundles[outputConfigPath] || {};
              bundles[outputConfigPath][bundle.outputPath] = output.modules;
            }

            BundleTasks._appendAutoImports(outputLocation, bundle);

            completeEntries++;

            build.log(
              '  Bundled: \'' +
              chalk.cyan(path.basename(bundle.outputPath)) +
              '\', took ' +
              chalk.magenta((new Date().getTime() - startTime) +
                'ms'));

            if (outputConfigPath) {
              inProgressConfigs[outputConfigPath]--;
            }

            if (outputConfigPath && !inProgressConfigs[outputConfigPath]) {
              // We are done with this config. Write out the config.

              // Update baseUrl.
              if (options.baseUrl) {
                bundleConfig.baseURL = options.baseUrl;
              }

              // Merge bundle definitions.
              _.merge(bundleConfig.bundles, bundles[outputConfigPath]);

              // Prune dependencies?
              this._pruneMap(bundleConfig);

              // Clear up the build flags.
              for (let dep in bundleConfig.meta) {
                if (bundleConfig.meta.hasOwnProperty(dep)) {
                  let meta = bundleConfig.meta[dep];
                  delete meta.build;
                }
              }

              build.log(
                '  Updated config: \'' +
                chalk.cyan(path.basename(outputConfigPath)) +
                '\'');

              // Write the file (both .js and .json versions.)
              let fullConfigPath = path.resolve(build.rootDir, outputConfigPath);
              let configContent = JSON.stringify(bundleConfig, null, 2);

              fs.writeFileSync(fullConfigPath, `System.config(${ configContent });`);
              fs.writeFileSync(fullConfigPath.replace('.js', '.json'), configContent);
            }

            // Call the callback.
            if (completeEntries === options.entries.length) {
              cb();
            }
          }, (error) => {
            completeEntries++;
            build.logError(error);
            if (completeEntries === options.entries.length) {
              cb();
            }
          });
        });
      } else {
        cb();
      }
    });

    build.task('bundle-watch', ['bundle'], () => {
      gulp.watch(options.paths.sourceMatch, ['serve-reload']);
    });
  }
  private static _pruneMap(config) {
    let newMap = {};

    for (let bundleName in config.bundles) {
      if (config.bundles.hasOwnProperty(bundleName)) {
        let bundleItems = config.bundles[bundleName];

        bundleItems.forEach(bundleItem => {
          Object.keys(config.map).forEach(mapKey => {
            if (bundleItem.indexOf(mapKey) >= 0) {
              newMap[mapKey] = config.map[mapKey];
            }
          });
        });
      }
    }

    config.map = newMap;
  }

  private static _getEntryLocation(bundle) {
    let entryLocation = bundle.entry;
    let arithmetic = [];
    let include = bundle.include || [];
    let exclude = bundle.exclude || [];

    // Auto exclude things in paths.
    for (let bundlePath in bundle.config.paths) {
      if (exclude.indexOf(bundlePath) === -1 && bundlePath.indexOf(':') === -1 && bundlePath.indexOf('*')) {
        exclude.push(bundlePath);
      }
    }

    if (include.length) {
      arithmetic = arithmetic.concat(include.map(includePath => '+ ' + includePath));
    }

    if (exclude.length) {
      arithmetic = arithmetic.concat(exclude.map(excludePath => '- ' + excludePath));
    }

    if (arithmetic.length) {
      entryLocation += ' ' + arithmetic.join(' ');
    }

    return entryLocation;
  }

  private static _appendAutoImports(outputPath, bundle) {
    // Add auto imports as necessary.
    if (bundle.autoImport && bundle.autoImport.length) {
      fs.appendFileSync(
        outputPath,
        bundle.autoImport.map(importPath => '\nSystem.import(' + JSON.stringify(importPath) + ');'
        ).join(''));
    }
  }

  private static _getDefaultBundleConfig(build, bundle) {
    let defaultConfig = {
      baseURL: '',
      defaultJSExtensions: true,
      paths: BundleTasks._getDefaultPaths(bundle),
      map: BundleTasks._createDependencyMap(build, bundle),
      meta: BundleTasks._getMetaExcludes(bundle),
      bundles: {}
    };

    return defaultConfig;
  }

  private static _getDefaultPaths(bundle) {
    let defaultPaths = {
      'npm:*': 'node_modules/*'
    };

    if (bundle.exclude) {
      bundle.exclude.forEach(excludeEntry => {
        defaultPaths[excludeEntry] = excludeEntry;
      });
    }

    return defaultPaths;
  }

  private static _getMetaExcludes(bundle) {
    // Exclude externals defined in paths from building/bundling by adding the build: false flag.
    let meta = {};

    if (bundle.exclude && bundle.exclude.length) {
      bundle.exclude.forEach(excludeEntry => {
        meta[excludeEntry] = {
          build: false
        };
      });
    }

    return meta;
  }

  private static _createDependencyMap(build: any, bundle: any) {
    let map = {};
    let visitedDeps = {};
    let config = bundle.config || {};
    let paths = config.paths || {};

    evalDependency(require(path.resolve(build.rootDir, 'package.json')));

    function evalDependency(pkg, parents?) {
      parents = parents || [];

      if (pkg.dependencies) {
        for (let dep in pkg.dependencies) {
          if (pkg.dependencies.hasOwnProperty(dep)) {
            addDependencyToMap(dep, parents);
          }
        }
      }

      if (pkg.peerDependencies) {
        for (let dep in pkg.peerDependencies) {
          if (pkg.peerDependencies.hasOwnProperty(dep)) {
            addDependencyToMap(dep, parents);
          }
        }
      }
    }

    function getImportPath(importPath) {
      // is it path/file.js ?
      if (fs.existsSync(importPath)) {
        let lstat = fs.lstatSync(importPath);

        if (!lstat.isDirectory()) { // this path is a file that exists. return it.
          return importPath;
        } else { // this is a directory reference (lib/), try index.js.
          importPath = getImportPath(path.join(importPath, 'index.js'));
        }
      } else { // is it path/file (omitting .js)
        importPath = getImportPath(path.join(importPath + '.js'));
      }

      return importPath;
    }

    function addDependencyToMap(dep, parents) {
      let isDepExcluded = bundle.exclude ? bundle.exclude.indexOf(dep) >= 0 : false;

      if (visitedDeps[dep] || isDepExcluded) {
        return;
      }

      // Avoid revisiting dependencies.
      visitedDeps[dep] = true;

      // If there isn't a path defined for the dependency, assume we should bundle it and add the map.
      if (!paths[dep]) {
        let depRoot = path.join(build.rootDir, `/node_modules/${ dep }`);

        parents = parents || [];

        build.logVerbose(`Evaluating dependency: ${ parents.join(' > ') }: ${ dep }`);

        // Try to add npm:dep:dep/{ path to main entry } by using the path from resolve.sync.
        try {
          let entryPath = resolve.sync(dep, { basedir: build.rootDir });

          if (fs.existsSync(entryPath)) {
            entryPath = path.relative(depRoot, entryPath).replace(/\\/g, '/');
            map[dep] = `npm:${ dep }/${ entryPath }`;
          }
        } catch (e) {
          build.logVerbose(chalk.red(`Unable to resolve entrypoint ${ dep }: ${ e }`));
        }

        // Try to add subdirectories for directory resolution.
        try {
          fs.readdirSync(depRoot).forEach(depSubdirectoryName => {
            let depSubdirectoryPath = path.join(depRoot, depSubdirectoryName);

            if (
              depSubdirectoryName[0] !== '.' &&
              depSubdirectoryName !== 'node_modules' &&
              fs.statSync(depSubdirectoryPath).isDirectory()
            ) {
              map[`${ dep }/${ depSubdirectoryName }`] = `npm:${ dep }/${ depSubdirectoryName }`;
            }
          });
        } catch (e) { /* no-op */
          build.logVerbose(e);
        }

        // Try to load packageJSON to evaluate the next set of dependencies.
        let packagePath = path.join(path.dirname(depRoot), `${ dep }/package.json`);

        if (fs.existsSync(packagePath)) {
          try {
            build.logVerbose(chalk.green(`${ dep } has a package.json.`));
            let depPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

            evalDependency(depPackage, parents.concat([dep]));
          } catch (e) {
            build.logVerbose(`Unable to load package.json for ${ dep } at ${ packagePath }`);
          }
        } else {
          build.logVerbose(`${ packagePath} doesn't exist!`);
        }
      }
    }

    return map;
  }
}
