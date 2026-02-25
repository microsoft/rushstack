// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { convertSlashesForWindows } from '../ShellOperationRunner.ts';

describe(convertSlashesForWindows.name, () => {
  it('converted inputs', () => {
    expect(convertSlashesForWindows('./node_modules/.bin/tslint -c config/tslint.json')).toEqual(
      '.\\node_modules\\.bin\\tslint -c config/tslint.json'
    );
    expect(convertSlashesForWindows('/blah/bleep&&/bloop')).toEqual('\\blah\\bleep&&/bloop');
    expect(convertSlashesForWindows('/blah/bleep')).toEqual('\\blah\\bleep');
    expect(convertSlashesForWindows('/blah/bleep --path a/b')).toEqual('\\blah\\bleep --path a/b');
    expect(convertSlashesForWindows('/blah/bleep>output.log')).toEqual('\\blah\\bleep>output.log');
    expect(convertSlashesForWindows('/blah/bleep<input.json')).toEqual('\\blah\\bleep<input.json');
    expect(convertSlashesForWindows('/blah/bleep|/blah/bloop')).toEqual('\\blah\\bleep|/blah/bloop');
  });
  it('ignored inputs', () => {
    expect(convertSlashesForWindows('/blah\\bleep && /bloop')).toEqual('/blah\\bleep && /bloop');
    expect(convertSlashesForWindows('cmd.exe /c blah')).toEqual('cmd.exe /c blah');
    expect(convertSlashesForWindows('"/blah/bleep"')).toEqual('"/blah/bleep"');
  });
});
