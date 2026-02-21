// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateRelativePathField } from '../RushConfigurationProject.ts';

describe(validateRelativePathField.name, () => {
  it('accepts valid paths', () => {
    validateRelativePathField('path/to/project', 'projectFolder', '/rush.json');
    validateRelativePathField('project', 'projectFolder', '/rush.json');
    validateRelativePathField('.', 'projectFolder', '/rush.json');
    validateRelativePathField('..', 'projectFolder', '/rush.json');
    validateRelativePathField('../path/to/project', 'projectFolder', '/rush.json');
  });

  it('should throw an error if the path is not relative', () => {
    expect(() =>
      validateRelativePathField('C:/path/to/project', 'projectFolder', '/rush.json')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('/path/to/project', 'publishFolder', '/rush.json')
    ).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path ends in a trailing slash', () => {
    expect(() =>
      validateRelativePathField('path/to/project/', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('p/', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path contains backslashes', () => {
    expect(() =>
      validateRelativePathField('path\\to\\project', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('path\\', 'someOtherField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path is not normalized', () => {
    expect(() =>
      validateRelativePathField('path/../to/project', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('path/./to/project', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('./path/to/project', 'someField', '/repo/rush.json')
    ).toThrowErrorMatchingSnapshot();
  });
});
