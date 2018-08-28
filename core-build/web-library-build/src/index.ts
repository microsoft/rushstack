// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CopyTask,
  GenerateShrinkwrapTask,
  IExecutable,
  jest,
  ValidateShrinkwrapTask,
  parallel,
  serial,
  task,
  watch,
  setConfig,
  getConfig,
  IBuildConfig
} from '@microsoft/gulp-core-build';
import { apiExtractor, tscCmd, tslintCmd, text } from '@microsoft/gulp-core-build-typescript';
import { sass } from '@microsoft/gulp-core-build-sass';
import { karma } from '@microsoft/gulp-core-build-karma';
import { webpack } from '@microsoft/gulp-core-build-webpack';
import { serve, reload } from '@microsoft/gulp-core-build-serve';
import { PostProcessSourceMaps } from './PostProcessSourceMaps';

export * from '@microsoft/gulp-core-build';
export * from '@microsoft/gulp-core-build-typescript';
export * from '@microsoft/gulp-core-build-sass';
export * from '@microsoft/gulp-core-build-karma';
export * from '@microsoft/gulp-core-build-webpack';
export * from '@microsoft/gulp-core-build-serve';

// pre copy and post copy allows you to specify a map of dest: [sources] to copy from one place to another.
export const preCopy: CopyTask = new CopyTask();
preCopy.name = 'pre-copy';

export const postCopy: CopyTask = new CopyTask();
postCopy.name = 'post-copy';

const sourceMatch: string[] = [
  'src/**/*.{ts,tsx,scss,js,txt,html}',
  '!src/**/*.scss.ts'
];

const PRODUCTION = !!getConfig().args['production'] || !!getConfig().args['ship'];
setConfig({
  production: PRODUCTION,
  shouldWarningsFailBuild: PRODUCTION
});

tslint.mergeConfig({
  displayAsWarning: true
});

// Define default task groups.
export const compileTsTasks: IExecutable = parallel(tscCmd, text);
export const buildTasks: IExecutable = task('build', serial(preCopy, sass, parallel(tslintCmd, compileTsTasks), apiExtractor, postCopy));
export const bundleTasks: IExecutable = task('bundle', serial(buildTasks, webpack));
export const testTasks: IExecutable = task('test', serial(buildTasks, karma, jest));
export const defaultTasks: IExecutable = serial(bundleTasks, karma, jest);
export const postProcessSourceMapsTask: PostProcessSourceMaps = new PostProcessSourceMaps();
export const validateShrinkwrapTask: ValidateShrinkwrapTask = new ValidateShrinkwrapTask();
export const generateShrinkwrapTask: GenerateShrinkwrapTask = new GenerateShrinkwrapTask();

task('validate-shrinkwrap', validateShrinkwrapTask);
task('generate', generateShrinkwrapTask);
task('test-watch', watch(sourceMatch, testTasks));

// For watch scenarios like serve, make sure to exclude generated files from src (like *.scss.ts.)
task('serve',
  serial(
  serve,
  watch(
    sourceMatch, serial(preCopy, sass, compileTsTasks,
      postCopy, webpack, postProcessSourceMapsTask, reload)
  ))
);

task('default', defaultTasks);
