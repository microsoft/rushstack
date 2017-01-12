import {
  CopyTask,
  GenerateShrinkwrapTask,
  IExecutable,
  ValidateShrinkwrapTask,
  parallel,
  serial,
  task,
  watch
} from '@microsoft/gulp-core-build';
import { apiExtractor, typescript, tslint, text } from '@microsoft/gulp-core-build-typescript';
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

// Define default task groups.
export const compileTsTasks: IExecutable = parallel(typescript, text, apiExtractor);
export const buildTasks: IExecutable = task('build', serial(preCopy, sass, parallel(compileTsTasks, text), postCopy));
export const bundleTasks: IExecutable = task('bundle', serial(buildTasks, webpack));
export const testTasks: IExecutable = serial(sass, compileTsTasks, karma);
export const defaultTasks: IExecutable = serial(bundleTasks, karma);
export const postProcessSourceMapsTask: PostProcessSourceMaps = new PostProcessSourceMaps();
export const validateShrinkwrapTask: ValidateShrinkwrapTask = new ValidateShrinkwrapTask();
export const generateShrinkwrapTask: GenerateShrinkwrapTask = new GenerateShrinkwrapTask();

task('validate-shrinkwrap', validateShrinkwrapTask);
task('generate', generateShrinkwrapTask);

task('test', testTasks);

task('test-watch', watch(sourceMatch, testTasks));

// For watch scenarios like serve, make sure to exclude generated files from src (like *.scss.ts.)
task('serve',
  serial(
    bundleTasks,
    serve,
    postProcessSourceMapsTask,
    watch(
      sourceMatch, serial(preCopy, sass, compileTsTasks,
        postCopy, webpack, postProcessSourceMapsTask, reload)
    )
  )
);

task('default', defaultTasks);
