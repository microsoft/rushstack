import { task, serial, parallel } from 'gulp-core-build';
import { typescript, tslint } from 'gulp-core-build-typescript';
import { mocha } from 'gulp-core-build-mocha';

export * from 'gulp-core-build';
export * from 'gulp-core-build-typescript';
export * from 'gulp-core-build-mocha';

// Define default task groups.
const buildTasks = task('build', parallel(tslint, typescript));
const testTasks = task('test', serial(buildTasks, mocha));

task('default', testTasks);
