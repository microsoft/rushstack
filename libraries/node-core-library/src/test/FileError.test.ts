// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileError } from '../FileError';

describe(FileError.name, () => {
  it('normalizes slashes in file paths', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: `C:\\path\\to\\project\\path\\to\\file`,
      projectFolder: 'C:\\path\\to\\project'
    });

    expect(error1.toString()).toEqual('./path/to/file - message');

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error2.toString()).toEqual('./path/to/file - message');
  });

  it('correctly performs Unix-style relative file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toEqual('./path/to/file:5:12 - message');

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'Unix' })).toEqual('./path/to/file:5 - message');

    const error3: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'Unix' })).toEqual('./path/to/file - message');

    const error4: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'Unix' })).toEqual('./path/to/file - message');
  });

  it('correctly performs Unix-style file absolute path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toEqual('C:\\path\\to\\file:5:12 - message');

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'Unix' })).toEqual('C:\\path\\to\\file:5 - message');

    const error3: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'Unix' })).toEqual('C:\\path\\to\\file - message');

    const error4: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'Unix' })).toEqual('C:\\path\\to\\file - message');
  });

  it('correctly performs Visual Studio-style relative file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      './path/to/file(5,12) - message'
    );

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      './path/to/file(5) - message'
    );

    const error3: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual('./path/to/file - message');

    const error4: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual('./path/to/file - message');
  });

  it('correctly performs Visual Studio-style absolute file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      'C:\\path\\to\\file(5,12) - message'
    );

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      'C:\\path\\to\\file(5) - message'
    );

    const error3: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      'C:\\path\\to\\file - message'
    );

    const error4: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'VisualStudio' })).toEqual(
      'C:\\path\\to\\file - message'
    );
  });

  it('correctly performs Azure DevOps-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=C:\\path\\to\\project\\path\\to\\file;linenumber=5;columnnumber=12;]message'
    );
    expect(error1.getFormattedErrorMessage({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=C:\\path\\to\\project\\path\\to\\file;linenumber=5;columnnumber=12;]message'
    );

    const error2: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=C:\\path\\to\\project\\path\\to\\file;linenumber=5;]message'
    );
    expect(error2.getFormattedErrorMessage({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=C:\\path\\to\\project\\path\\to\\file;linenumber=5;]message'
    );

    const error3: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=C:\\path\\to\\project\\path\\to\\file;]message'
    );
    expect(error3.getFormattedErrorMessage({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=C:\\path\\to\\project\\path\\to\\file;]message'
    );

    const error4: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'AzureDevOps' })).toEqual(
      '##vso[task.logissue type=error;sourcepath=C:\\path\\to\\project\\path\\to\\file;]message'
    );
    expect(error4.getFormattedErrorMessage({ format: 'AzureDevOps', isWarning: true })).toEqual(
      '##vso[task.logissue type=warning;sourcepath=C:\\path\\to\\project\\path\\to\\file;]message'
    );
  });
});

describe(`${FileError.name} using arbitrary base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = 'C:/path';
  });

  afterEach(() => {
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toEqual(
      './to/project/path/to/file:5:12 - message'
    );
  });
});

describe(`${FileError.name} using PROJECT_FOLDER base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{PROJECT_FOLDER}';
  });

  afterEach(() => {
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toEqual('./path/to/file:5:12 - message');
  });
});

describe(`${FileError.name} using arbitrary base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{ABSOLUTE_PATH}';
  });

  afterEach(() => {
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toEqual(
      'C:\\path\\to\\project\\path\\to\\file:5:12 - message'
    );
  });
});

describe(`${FileError.name} using unsupported base folder token`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{SOME_TOKEN}';
  });

  afterEach(() => {
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
  });

  it('throws when performing Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: 'C:/path/to/project/path/to/file',
      projectFolder: 'C:/path/to/project',
      line: 5,
      column: 12
    });
    expect(() => error1.getFormattedErrorMessage({ format: 'Unix' })).toThrowError();
  });
});
