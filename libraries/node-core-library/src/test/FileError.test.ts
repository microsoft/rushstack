// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileError } from '../FileError';
import type { FileLocationStyle } from '../Path';

describe(FileError.name, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  it('returns Unix-style relative file path formatting for the toString() method', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: `/path/to/project/path/to/file`,
      projectFolder: '/path/to/project'
    });
    expect(error1.toString()).toMatchInlineSnapshot(`"path/to/file - message"`);
  });

  it('correctly performs Unix-style relative file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"path/to/file:5:12 - message"`
    );

    const error2: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"path/to/file:5 - message"`
    );

    const error3: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"path/to/file - message"`
    );

    const error4: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"path/to/file - message"`
    );
  });

  it('correctly performs Unix-style file absolute path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error1Message: string = error1.getFormattedErrorMessage({ format: 'Unix' });
    expect(error1Message).toMatch(/.+:5:12 - message$/);
    const error1Path: string = error1Message.slice(0, error1Message.length - ':5:12 - message'.length);
    expect(path.isAbsolute(error1Path)).toEqual(true);

    const error2: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: 5
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error2Message: string = error2.getFormattedErrorMessage({ format: 'Unix' });
    expect(error2Message).toMatch(/.+:5 - message$/);
    const error2Path: string = error2Message.slice(0, error2Message.length - ':5 - message'.length);
    expect(path.isAbsolute(error2Path)).toEqual(true);

    const error3: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: undefined,
      column: 12
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error3Message: string = error3.getFormattedErrorMessage({ format: 'Unix' });
    expect(error3Message).toMatch(/.+ - message$/);
    const error3Path: string = error3Message.slice(0, error3Message.length - ' - message'.length);
    expect(path.isAbsolute(error3Path)).toEqual(true);

    const error4: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project'
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error4Message: string = error4.getFormattedErrorMessage({ format: 'Unix' });
    expect(error4Message).toMatch(/.+ - message$/);
    const error4Path: string = error4Message.slice(0, error4Message.length - ' - message'.length);
    expect(path.isAbsolute(error4Path)).toEqual(true);
  });

  it('correctly performs Visual Studio-style relative file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'VisualStudio' })).toMatchInlineSnapshot(
      `"path/to/file(5,12) - message"`
    );

    const error2: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5
    });
    expect(error2.getFormattedErrorMessage({ format: 'VisualStudio' })).toMatchInlineSnapshot(
      `"path/to/file(5) - message"`
    );

    const error3: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: undefined,
      column: 12
    });
    expect(error3.getFormattedErrorMessage({ format: 'VisualStudio' })).toMatchInlineSnapshot(
      `"path/to/file - message"`
    );

    const error4: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project'
    });
    expect(error4.getFormattedErrorMessage({ format: 'VisualStudio' })).toMatchInlineSnapshot(
      `"path/to/file - message"`
    );
  });

  it('correctly performs Visual Studio-style absolute file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error1Message: string = error1.getFormattedErrorMessage({ format: 'VisualStudio' });
    expect(error1Message).toMatch(/.+\(5,12\) - message$/);
    const error1Path: string = error1Message.slice(0, error1Message.length - '(5,12) - message'.length);
    expect(path.isAbsolute(error1Path)).toEqual(true);

    const error2: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: 5
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error2Message: string = error2.getFormattedErrorMessage({ format: 'VisualStudio' });
    expect(error2Message).toMatch(/.+\(5\) - message$/);
    const error2Path: string = error2Message.slice(0, error2Message.length - '(5) - message'.length);
    expect(path.isAbsolute(error2Path)).toEqual(true);

    const error3: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project',
      line: undefined,
      column: 12
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error3Message: string = error3.getFormattedErrorMessage({ format: 'VisualStudio' });
    expect(error3Message).toMatch(/.+ - message$/);
    const error3Path: string = error3Message.slice(0, error3Message.length - ' - message'.length);
    expect(path.isAbsolute(error3Path)).toEqual(true);

    const error4: FileError = new FileError('message', {
      absolutePath: '/path/to/file',
      projectFolder: '/path/to/project'
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error4Message: string = error4.getFormattedErrorMessage({ format: 'VisualStudio' });
    expect(error4Message).toMatch(/.+ - message$/);
    const error4Path: string = error4Message.slice(0, error4Message.length - ' - message'.length);
    expect(path.isAbsolute(error4Path)).toEqual(true);
  });
});

describe(`${FileError.name} using arbitrary base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '/path';
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"to/project/path/to/file:5:12 - message"`
    );
  });
});

describe(`${FileError.name} using PROJECT_FOLDER base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{PROJECT_FOLDER}';
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    expect(error1.getFormattedErrorMessage({ format: 'Unix' })).toMatchInlineSnapshot(
      `"path/to/file:5:12 - message"`
    );
  });
});

describe(`${FileError.name} using ABSOLUTE_PATH base folder`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{ABSOLUTE_PATH}';
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  it('correctly performs Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    // Because the file path is resolved on disk, the output will vary based on platform.
    // Only check that it ends as expected and is an absolute path.
    const error1Message: string = error1.getFormattedErrorMessage({ format: 'Unix' });
    expect(error1Message).toMatch(/.+:5:12 - message$/);
    const error1Path: string = error1Message.slice(0, error1Message.length - ':5:12 - message'.length);
    expect(path.isAbsolute(error1Path)).toEqual(true);
  });
});

describe(`${FileError.name} using unsupported base folder token`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = '{SOME_TOKEN}';
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  it('throws when performing Unix-style file path formatting', () => {
    const error1: FileError = new FileError('message', {
      absolutePath: '/path/to/project/path/to/file',
      projectFolder: '/path/to/project',
      line: 5,
      column: 12
    });
    expect(() => error1.getFormattedErrorMessage({ format: 'Unix' })).toThrowError();
  });
});

describe(`${FileError.name} problem matcher patterns`, () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    FileError._sanitizedEnvironmentVariable = undefined;
    FileError._environmentVariableIsAbsolutePath = false;
  });

  afterEach(() => {
    if (originalValue) {
      process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER = originalValue;
    } else {
      delete process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER;
    }
  });

  const errorStringFormats = ['Unix', 'VisualStudio'] satisfies FileLocationStyle[];
  errorStringFormats.forEach((format) => {
    it(`${format} format - message without code`, () => {
      const projectFolder = '/path/to/project';
      const relativePathToFile = 'path/to/file';
      const absolutePathToFile = `${projectFolder}/${relativePathToFile}`;
      const lineNumber = 5;
      const columnNumber = 12;

      const error1 = new FileError('message', {
        absolutePath: absolutePathToFile,
        projectFolder: projectFolder,
        line: lineNumber,
        column: columnNumber
      });
      const errorMessage = error1.getFormattedErrorMessage({ format });
      const pattern = FileError.getProblemMatcher({ format });

      const regexp = new RegExp(pattern.regexp);
      const matches = regexp.exec(errorMessage);
      expect(matches).toBeDefined();
      if (matches) {
        expect(matches[pattern.file!]).toEqual(relativePathToFile);
        expect(parseInt(matches[pattern.line!], 10)).toEqual(lineNumber);
        expect(parseInt(matches[pattern.column!], 10)).toEqual(columnNumber);
        expect(matches[pattern.message]).toEqual('message');
      }
    });

    it(`${format} format - message with code`, () => {
      const projectFolder = '/path/to/project';
      const relativePathToFile = 'path/to/file';
      const absolutePathToFile = `${projectFolder}/${relativePathToFile}`;
      const lineNumber = 5;
      const columnNumber = 12;

      const error1 = new FileError('(code) message', {
        absolutePath: absolutePathToFile,
        projectFolder: projectFolder,
        line: lineNumber,
        column: columnNumber
      });
      const errorMessage = error1.getFormattedErrorMessage({ format });
      const pattern = FileError.getProblemMatcher({ format });

      const regexp = new RegExp(pattern.regexp);
      const matches = regexp.exec(errorMessage);
      expect(matches).toBeDefined();
      if (matches) {
        expect(matches[pattern.file!]).toEqual(relativePathToFile);
        expect(parseInt(matches[pattern.line!], 10)).toEqual(lineNumber);
        expect(parseInt(matches[pattern.column!], 10)).toEqual(columnNumber);
        expect(matches[pattern.message]).toEqual('message');
        expect(matches[pattern.code!]).toEqual('code');
      }
    });
  });
});
