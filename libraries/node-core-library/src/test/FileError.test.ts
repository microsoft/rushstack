// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileError } from '../FileError';

describe(FileError.name, () => {
  it('normalizes slashes in file paths', () => {
    const error1: FileError = new FileError('message', {
      filePath: '\\path\\to\\file'
    });
    expect(error1.filePath).toEqual('/path/to/file');

    const error2: FileError = new FileError('message', {
      filePath: '/path/to/file'
    });
    expect(error2.filePath).toEqual('/path/to/file');
  });

  it('asserts absolute file paths', () => {
    const error1: FileError = new FileError('message', {
      filePath: '\\path\\to\\file'
    });
    expect(error1.filePath).toEqual('/path/to/file');

    const error2: FileError = new FileError('message', {
      filePath: '/path/to/file'
    });
    expect(error2.filePath).toEqual('/path/to/file');

    const error3: FileError = new FileError('message', {
      filePath: 'C:\\path\\to\\file'
    });
    expect(error3.filePath).toEqual('C:/path/to/file');

    const error4: FileError = new FileError('message', {
      filePath: 'C:/path/to/file'
    });
    expect(error4.filePath).toEqual('C:/path/to/file');

    expect(() => new FileError('message', { filePath: 'path/to/file' })).toThrow();
    expect(() => new FileError('message', { filePath: './path/to/file' })).toThrow();
    expect(() => new FileError('message', { filePath: '../path/to/file' })).toThrow();
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5,
      column: 12
    });
    expect(error1.toString('Unix')).toEqual('/path/to/file:5:12 - message');

    const error2: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5
    });
    expect(error2.toString('Unix')).toEqual('/path/to/file:5 - message');

    const error3: FileError = new FileError('message', {
      filePath: '/path/to/file',
      column: 12
    });
    expect(error3.toString('Unix')).toEqual('/path/to/file - message');

    const error4: FileError = new FileError('message', {
      filePath: '/path/to/file'
    });
    expect(error4.toString('Unix')).toEqual('/path/to/file - message');
  });

  it('correctly performs Visual Studio-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5,
      column: 12
    });
    expect(error1.toString('VisualStudio')).toEqual('/path/to/file(5,12) - message');

    const error2: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5
    });
    expect(error2.toString('VisualStudio')).toEqual('/path/to/file(5) - message');

    const error3: FileError = new FileError('message', {
      filePath: '/path/to/file',
      column: 12
    });
    expect(error3.toString('VisualStudio')).toEqual('/path/to/file - message');

    const error4: FileError = new FileError('message', {
      filePath: '/path/to/file'
    });
    expect(error4.toString('VisualStudio')).toEqual('/path/to/file - message');
  });

  it('correctly performs Azure DevOps-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5,
      column: 12
    });
    expect(error1.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;linenumber=5;columnnumber=12;]message'
    );

    const error2: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5
    });
    expect(error2.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;linenumber=5;]message'
    );

    const error3: FileError = new FileError('message', {
      filePath: '/path/to/file',
      column: 12
    });
    expect(error3.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;]message'
    );

    const error4: FileError = new FileError('message', {
      filePath: '/path/to/file'
    });
    expect(error4.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;]message'
    );

    const warning1: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5,
      column: 12,
      isWarning: true
    });
    expect(warning1.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;linenumber=5;columnnumber=12;]message'
    );

    const warning2: FileError = new FileError('message', {
      filePath: '/path/to/file',
      line: 5,
      isWarning: true
    });
    expect(warning2.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;linenumber=5;]message'
    );

    const warning3: FileError = new FileError('message', {
      filePath: '/path/to/file',
      column: 12,
      isWarning: true
    });
    expect(warning3.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;]message'
    );

    const warning4: FileError = new FileError('message', {
      filePath: '/path/to/file',
      isWarning: true
    });
    expect(warning4.toString('AzureDevOps')).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;]message'
    );
  });
});
