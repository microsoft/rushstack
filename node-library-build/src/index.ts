import { task, watch, serial, parallel, IExecutable } from '@microsoft/gulp-core-build';
import { typescript, tslint } from '@microsoft/gulp-core-build-typescript';
import { instrument, mocha } from '@microsoft/gulp-core-build-mocha';

export * from '@microsoft/gulp-core-build';
export * from '@microsoft/gulp-core-build-typescript';
export * from '@microsoft/gulp-core-build-mocha';

// Define default task groups.
export const buildTasks: IExecutable = task('build', parallel(tslint, typescript));
export const testTasks: IExecutable = task('test', serial(typescript, mocha));
export const defaultTasks: IExecutable = task('default', serial(buildTasks, instrument, mocha));

task('watch', watch('src/**.ts', testTasks));
