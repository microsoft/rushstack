'use strict';

// Karma configuration
// Generated on Thu Oct 08 2015 18:13:05 GMT-0700 (PDT)

let build = require('./lib/index');
let testConfig = build.config.test;
let path = require('path');
let bindPolyfillPath = require.resolve('phantomjs-polyfill/bind-polyfill.js');

module.exports = function(config) {

  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: build.rootDir,


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    //frameworks: ['mocha', 'common_js'],
    frameworks: ['mocha'],


    // list of files / patterns to load in the browser
    files: [ bindPolyfillPath ].concat(testConfig.paths.include),


    // list of files to exclude
    exclude: testConfig.paths.exclude,


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'lib/**/!(*.test).js': ['coverage', 'webpack'],
      '**/*.test.js': ['webpack']
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['mocha-clean', 'coverage'],


    coverageReporter: {
      dir: 'coverage/',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
      ]
    },

    webpack: {
    // webpack configuration
      module: {
        postLoaders: [{
          test: /\.js/,
          exclude: /(test|node_modules|bower_components)/,
          loader: require.resolve('istanbul-instrumenter-loader')
        }]
      },
      resolve: {
        modulesDirectories: [
          "",
          "lib",
          "node_modules"
        ]
      }
    },


    webpackMiddleware: {
      noInfo: true
    },

    plugins: [
      require('karma-mocha'),
      require('istanbul-instrumenter-loader'),
      require('karma-coverage'),
      require('karma-mocha-clean-reporter'),
      require('karma-phantomjs-launcher'),
      require('karma-webpack')
    ],



    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJS'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true
  })
}
