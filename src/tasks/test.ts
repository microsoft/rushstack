/// <reference path="../../typings/tsd" />

import { ITestOptions } from '../options/test';

export default class TestTasks { // implements ITaskGroup {

  public static registerTasks(build: any, options: ITestOptions) {
    let gulp = build.gulp;
    let paths = options.paths;
    let path = require('path');
    let server = require('karma').Server;
    let singleRun = (process.argv.indexOf('--debug') === -1);
    let matchIndex = (process.argv.indexOf('--match'));
    let matchString = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];

    build.task('test', ['build'], (cb) => {
      let configPath = path.resolve(__dirname, '../../karma.conf.js');

      if (matchString) {
        build.log(`Running tests that match "${matchString}"`);
      }

      new server({
        configFile: configPath,
        singleRun: singleRun,
        client: {
          mocha: {
            grep: matchString
          }
        }
      }, () => {
        cb();
      }).start();

    });

    build.task('test-watch', () => {
      gulp.watch([paths.sourceMatch], ['test']);
    });
  }
}
