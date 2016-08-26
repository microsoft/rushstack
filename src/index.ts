import { task, serial, parallel, watch, CopyTask } from '@microsoft/gulp-core-build';
import { typescript, tslint, text } from '@microsoft/gulp-core-build-typescript';
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
const postProcessSourceMaps = new PostProcessSourceMaps();

task('test', serial(sass, parallel(typescript, text), karma));

task('test-watch', watch(sourceMatch, serial(sass, parallel(typescript, text), karma)));

// For watch scenarios like serve, make sure to exclude generated files from src (like *.scss.ts.)
task('serve',
  serial(
    bundleTasks,
    serve,
    postProcessSourceMaps as any, // tslint:disable-line:no-any
    watch(
      sourceMatch, serial(preCopy, sass, parallel(typescript, text),
      postCopy, webpack, postProcessSourceMaps as any, reload) // tslint:disable-line:no-any
    )
  )
);

task('default', serial(bundleTasks, karma));
