/// <reference path="../../typings/tsd" />
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var shouldMinify = process.argv.indexOf('--production') > -1;
var resolve = require('resolve');
var chalk = require('chalk');
var BundleTasks = (function () {
    function BundleTasks() {
    }
    BundleTasks.registerTasks = function (build, options) {
        var _this = this;
        var gulp = build.gulp;
        build.task('bundle', ['build'], function (cb) {
            if (options.entries && options.entries.length) {
                var completeEntries = 0;
                var inProgressConfigs = {};
                var bundles = {};
                options.entries.forEach(function (bundle) {
                    var builder = new (require('systemjs-builder'))('');
                    bundle.config = _.merge({}, options.config, bundle.config);
                    // Build bundle config.
                    var bundleConfig = _.merge({}, BundleTasks._getDefaultBundleConfig(build, bundle), bundle.config);
                    var outputConfigPath = bundle.configPath;
                    var entryLocation = BundleTasks._getEntryLocation(bundle);
                    var outputLocation = path.resolve(build.rootDir, bundle.outputPath);
                    var startTime = new Date().getTime();
                    if (outputConfigPath) {
                        inProgressConfigs[outputConfigPath] = (inProgressConfigs[outputConfigPath] || 0) + 1;
                    }
                    builder.config(bundleConfig);
                    build.logVerbose(chalk.magenta("Bundle config for " + bundle.outputPath + ":"));
                    build.logVerbose(JSON.stringify(bundleConfig, null, 2));
                    builder[bundle.isStandalone ? 'buildStatic' : 'bundle'](entryLocation, outputLocation, {
                        minify: shouldMinify,
                        format: 'amd'
                    }).then(function (output) {
                        if (outputConfigPath) {
                            bundles[outputConfigPath] = bundles[outputConfigPath] || {};
                            bundles[outputConfigPath][bundle.outputPath] = output.modules;
                        }
                        BundleTasks._appendAutoImports(outputLocation, bundle);
                        completeEntries++;
                        build.log('  Bundled: \'' +
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
                            _this._pruneMap(bundleConfig);
                            // Clear up the build flags.
                            for (var dep in bundleConfig.meta) {
                                if (bundleConfig.meta.hasOwnProperty(dep)) {
                                    var meta = bundleConfig.meta[dep];
                                    delete meta.build;
                                }
                            }
                            build.log('  Updated config: \'' +
                                chalk.cyan(path.basename(outputConfigPath)) +
                                '\'');
                            // Write the file (both .js and .json versions.)
                            var fullConfigPath = path.resolve(build.rootDir, outputConfigPath);
                            var configContent = JSON.stringify(bundleConfig, null, 2);
                            fs.writeFileSync(fullConfigPath, "System.config(" + configContent + ");");
                            fs.writeFileSync(fullConfigPath.replace('.js', '.json'), configContent);
                        }
                        // Call the callback.
                        if (completeEntries === options.entries.length) {
                            cb();
                        }
                    }, function (error) {
                        completeEntries++;
                        build.logError(error);
                        if (completeEntries === options.entries.length) {
                            cb();
                        }
                    });
                });
            }
            else {
                cb();
            }
        });
        build.task('bundle-watch', ['bundle'], function () {
            gulp.watch(options.paths.sourceMatch, ['serve-reload']);
        });
    };
    BundleTasks._pruneMap = function (config) {
        var newMap = {};
        for (var bundleName in config.bundles) {
            if (config.bundles.hasOwnProperty(bundleName)) {
                var bundleItems = config.bundles[bundleName];
                bundleItems.forEach(function (bundleItem) {
                    Object.keys(config.map).forEach(function (mapKey) {
                        if (bundleItem.indexOf(mapKey) >= 0) {
                            newMap[mapKey] = config.map[mapKey];
                        }
                    });
                });
            }
        }
        config.map = newMap;
    };
    BundleTasks._getEntryLocation = function (bundle) {
        var entryLocation = bundle.entry;
        var arithmetic = [];
        var include = bundle.include || [];
        var exclude = bundle.exclude || [];
        // Auto exclude things in paths.
        for (var bundlePath in bundle.config.paths) {
            if (exclude.indexOf(bundlePath) === -1 && bundlePath.indexOf(':') === -1 && bundlePath.indexOf('*')) {
                exclude.push(bundlePath);
            }
        }
        if (include.length) {
            arithmetic = arithmetic.concat(include.map(function (includePath) { return '+ ' + includePath; }));
        }
        if (exclude.length) {
            arithmetic = arithmetic.concat(exclude.map(function (excludePath) { return '- ' + excludePath; }));
        }
        if (arithmetic.length) {
            entryLocation += ' ' + arithmetic.join(' ');
        }
        return entryLocation;
    };
    BundleTasks._appendAutoImports = function (outputPath, bundle) {
        // Add auto imports as necessary.
        if (bundle.autoImport && bundle.autoImport.length) {
            fs.appendFileSync(outputPath, bundle.autoImport.map(function (importPath) { return '\nSystem.import(' + JSON.stringify(importPath) + ');'; }).join(''));
        }
    };
    BundleTasks._getDefaultBundleConfig = function (build, bundle) {
        var defaultConfig = {
            baseURL: '',
            defaultJSExtensions: true,
            paths: BundleTasks._getDefaultPaths(bundle),
            map: BundleTasks._createDependencyMap(build, bundle),
            meta: BundleTasks._getMetaExcludes(bundle),
            bundles: {}
        };
        return defaultConfig;
    };
    BundleTasks._getDefaultPaths = function (bundle) {
        var defaultPaths = {
            'npm:*': 'node_modules/*'
        };
        if (bundle.exclude) {
            bundle.exclude.forEach(function (excludeEntry) {
                defaultPaths[excludeEntry] = excludeEntry;
            });
        }
        return defaultPaths;
    };
    BundleTasks._getMetaExcludes = function (bundle) {
        // Exclude externals defined in paths from building/bundling by adding the build: false flag.
        var meta = {};
        if (bundle.exclude && bundle.exclude.length) {
            bundle.exclude.forEach(function (excludeEntry) {
                meta[excludeEntry] = {
                    build: false
                };
            });
        }
        return meta;
    };
    BundleTasks._createDependencyMap = function (build, bundle) {
        var map = {};
        var visitedDeps = {};
        var config = bundle.config || {};
        var paths = config.paths || {};
        evalDependency(require(path.resolve(build.rootDir, 'package.json')));
        function evalDependency(pkg, parents) {
            parents = parents || [];
            if (pkg.dependencies) {
                for (var dep in pkg.dependencies) {
                    if (pkg.dependencies.hasOwnProperty(dep)) {
                        addDependencyToMap(dep, parents);
                    }
                }
            }
            if (pkg.peerDependencies) {
                for (var dep in pkg.peerDependencies) {
                    if (pkg.peerDependencies.hasOwnProperty(dep)) {
                        addDependencyToMap(dep, parents);
                    }
                }
            }
        }
        function getImportPath(importPath) {
            // is it path/file.js ?
            if (fs.existsSync(importPath)) {
                var lstat = fs.lstatSync(importPath);
                if (!lstat.isDirectory()) {
                    return importPath;
                }
                else {
                    importPath = getImportPath(path.join(importPath, 'index.js'));
                }
            }
            else {
                importPath = getImportPath(path.join(importPath + '.js'));
            }
            return importPath;
        }
        function addDependencyToMap(dep, parents) {
            var isDepExcluded = bundle.exclude ? bundle.exclude.indexOf(dep) >= 0 : false;
            if (visitedDeps[dep] || isDepExcluded) {
                return;
            }
            // Avoid revisiting dependencies.
            visitedDeps[dep] = true;
            // If there isn't a path defined for the dependency, assume we should bundle it and add the map.
            if (!paths[dep]) {
                var depRoot = path.join(build.rootDir, "/node_modules/" + dep);
                parents = parents || [];
                build.logVerbose("Evaluating dependency: " + parents.join(' > ') + ": " + dep);
                // Try to add npm:dep:dep/{ path to main entry } by using the path from resolve.sync.
                try {
                    var entryPath = resolve.sync(dep, { basedir: build.rootDir });
                    if (fs.existsSync(entryPath)) {
                        entryPath = path.relative(depRoot, entryPath).replace(/\\/g, '/');
                        map[dep] = "npm:" + dep + "/" + entryPath;
                    }
                }
                catch (e) {
                    build.logVerbose(chalk.red("Unable to resolve entrypoint " + dep + ": " + e));
                }
                // Try to add subdirectories for directory resolution.
                try {
                    fs.readdirSync(depRoot).forEach(function (depSubdirectoryName) {
                        var depSubdirectoryPath = path.join(depRoot, depSubdirectoryName);
                        if (depSubdirectoryName[0] !== '.' &&
                            depSubdirectoryName !== 'node_modules' &&
                            fs.statSync(depSubdirectoryPath).isDirectory()) {
                            map[(dep + "/" + depSubdirectoryName)] = "npm:" + dep + "/" + depSubdirectoryName;
                        }
                    });
                }
                catch (e) {
                    build.logVerbose(e);
                }
                // Try to load packageJSON to evaluate the next set of dependencies.
                var packagePath = path.join(path.dirname(depRoot), dep + "/package.json");
                if (fs.existsSync(packagePath)) {
                    try {
                        build.logVerbose(chalk.green(dep + " has a package.json."));
                        var depPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                        evalDependency(depPackage, parents.concat([dep]));
                    }
                    catch (e) {
                        build.logVerbose("Unable to load package.json for " + dep + " at " + packagePath);
                    }
                }
                else {
                    build.logVerbose(packagePath + " doesn't exist!");
                }
            }
        }
        return map;
    };
    return BundleTasks;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BundleTasks;
