import { task, serial, parallel, watch, CopyTask } from 'gulp-core-build';
import { typescript, tslint, text } from 'gulp-core-build-typescript';
import { sass } from 'gulp-core-build-sass';
import { karma } from 'gulp-core-build-karma';
import { webpack } from 'gulp-core-build-webpack';
import { serve, reload } from 'gulp-core-build-serve';

export * from 'gulp-core-build';
export * from 'gulp-core-build-typescript';
export * from 'gulp-core-build-sass';
export * from 'gulp-core-build-karma';
export * from 'gulp-core-build-webpack';
export * from 'gulp-core-build-serve';

export const preCopy = new CopyTask();
preCopy.name = 'pre-copy';

export const postCopy = new CopyTask();
postCopy.name = 'post-copy';

const sourceMatch = [
  'src/**/*.{ts,tsx,scss,js,txt,html}',
  '!src/**/*.scss.ts'
];

// Define default task groups.
let buildTasks = task('build', serial(preCopy, sass, parallel(tslint, typescript, text), postCopy));
let bundleTasks = task('bundle', serial(buildTasks, webpack));

task('test', serial(sass, parallel(typescript, text), karma));

task('test-watch', watch(sourceMatch, serial(sass, parallel(typescript, text), karma)));

// For watch scenarios like serve, make sure to exclude generated files from src (like *.scss.ts.)
task('serve',
  serial(
    bundleTasks,
    serve,
    watch(sourceMatch, serial(preCopy, sass, parallel(typescript, text), postCopy, webpack, reload)
    )
  )
);

task('default', serial(bundleTasks, karma));
