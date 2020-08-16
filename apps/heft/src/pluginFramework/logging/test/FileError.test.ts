// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileError, FileErrorFormat } from '../FileError';

describe('FileError', () => {
  it('normalizes slashes in file paths', () => {
    const error1: FileError = new FileError('message', 'path\\to\\file', 0);
    expect(error1.filePath).toEqual('path/to/file');

    const error2: FileError = new FileError('message', 'path/to/file', 0);
    expect(error2.filePath).toEqual('path/to/file');
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', 'path/to/file', 5, 12);
    expect(error1.toString(FileErrorFormat.Unix)).toEqual('path/to/file:5:12 - message');

    const error2: FileError = new FileError('message', 'path/to/file', 5);
    expect(error2.toString(FileErrorFormat.Unix)).toEqual('path/to/file:5 - message');

    const error3: FileError = new FileError('message', 'path/to/file');
    expect(error3.toString(FileErrorFormat.Unix)).toEqual('path/to/file - message');
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', 'path/to/file', 5, 12);
    expect(error1.toString(FileErrorFormat.VisualStudio)).toEqual('path/to/file(5,12) - message');

    const error2: FileError = new FileError('message', 'path/to/file', 5);
    expect(error2.toString(FileErrorFormat.VisualStudio)).toEqual('path/to/file(5) - message');

    const error3: FileError = new FileError('message', 'path/to/file');
    expect(error3.toString(FileErrorFormat.VisualStudio)).toEqual('path/to/file - message');
  });
});
