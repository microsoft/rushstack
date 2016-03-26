import { task, serial, parallel, watch } from 'gulp-core-build';
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

// Define default task groups.
let buildTasks = task('build', parallel(tslint, typescript, text, sass));
let bundleTasks = task('bundle', serial(buildTasks, webpack));

task('test', serial(buildTasks, karma));

task('serve',
  serial(
    bundleTasks,
    serve,
    watch('src/**/*.{ts,tsx,scss,js,txt,html}', serial(bundleTasks, reload))
  )
);

task('default', serial(bundleTasks, karma));
