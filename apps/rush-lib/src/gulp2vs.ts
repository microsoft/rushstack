// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';

import { Interleaver, ITaskWriter } from '@microsoft/stream-collator';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

const writer: ITaskWriter = Interleaver.registerTask('vs gulp');

const gulpBundle: child_process.ChildProcess = child_process.exec('gulp');

gulpBundle.stdout.on('data', (data: string) => {
  writer.write(data);
});

gulpBundle.stderr.on('data', (data: string) => {
  writer.writeError(data);
});

gulpBundle.on('exit', (code: number) => {
  writer.writeLine('gulp2vs: Done.');
  writer.close();
  process.exit(code);
});
