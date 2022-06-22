// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileError } from '../FileError';

describe(FileError.name, () => {
  it('normalizes slashes in file paths', () => {
    const error1: FileError = new FileError('message', '\\path\\to\\file');
    expect(error1.filePath).toEqual('/path/to/file');

    const error2: FileError = new FileError('message', '/path/to/file');
    expect(error2.filePath).toEqual('/path/to/file');
  });

  it('asserts absolute file paths', () => {
    const error1: FileError = new FileError('message', '\\path\\to\\file');
    expect(error1.filePath).toEqual('/path/to/file');

    const error2: FileError = new FileError('message', '/path/to/file');
    expect(error2.filePath).toEqual('/path/to/file');

    const error3: FileError = new FileError('message', 'C:\\path\\to\\file');
    expect(error3.filePath).toEqual('C:/path/to/file');

    const error4: FileError = new FileError('message', 'C:/path/to/file');
    expect(error4.filePath).toEqual('C:/path/to/file');

    expect(() => new FileError('message', 'path/to/file')).toThrow();
    expect(() => new FileError('message', './path/to/file')).toThrow();
    expect(() => new FileError('message', '../path/to/file')).toThrow();
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', '/path/to/file', 5, 12);
    expect(error1.toString({ format: 'Unix' })).toEqual('/path/to/file:5:12 - message');

    const error2: FileError = new FileError('message', '/path/to/file', 5);
    expect(error2.toString({ format: 'Unix' })).toEqual('/path/to/file:5 - message');

    const error3: FileError = new FileError('message', '/path/to/file', undefined, 12);
    expect(error3.toString({ format: 'Unix' })).toEqual('/path/to/file - message');

    const error4: FileError = new FileError('message', '/path/to/file');
    expect(error4.toString({ format: 'Unix' })).toEqual('/path/to/file - message');
  });

  it('correctly performs Visual Studio-style file path formatting', () => {
    const error1: FileError = new FileError('message', '/path/to/file', 5, 12);
    expect(error1.toString({ format: 'VisualStudio' })).toEqual('/path/to/file(5,12) - message');

    const error2: FileError = new FileError('message', '/path/to/file', 5);
    expect(error2.toString({ format: 'VisualStudio' })).toEqual('/path/to/file(5) - message');

    const error3: FileError = new FileError('message', '/path/to/file', undefined, 12);
    expect(error3.toString({ format: 'VisualStudio' })).toEqual('/path/to/file - message');

    const error4: FileError = new FileError('message', '/path/to/file');
    expect(error4.toString({ format: 'VisualStudio' })).toEqual('/path/to/file - message');
  });

  it('correctly performs Azure DevOps-style file path formatting', () => {
    const error1: FileError = new FileError('message', '/path/to/file', 5, 12);
    expect(error1.toString({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;linenumber=5;columnnumber=12;]message'
    );
    expect(error1.toString({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;linenumber=5;columnnumber=12;]message'
    );

    const error2: FileError = new FileError('message', '/path/to/file', 5);
    expect(error2.toString({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;linenumber=5;]message'
    );
    expect(error2.toString({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;linenumber=5;]message'
    );

    const error3: FileError = new FileError('message', '/path/to/file', undefined, 12);
    expect(error3.toString({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;]message'
    );
    expect(error3.toString({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;]message'
    );

    const error4: FileError = new FileError('message', '/path/to/file');
    expect(error4.toString({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=/path/to/file;]message'
    );
    expect(error4.toString({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=/path/to/file;]message'
    );
  });
});
