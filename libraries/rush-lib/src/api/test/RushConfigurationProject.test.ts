// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateRelativePathField } from '../RushConfigurationProject';

describe(validateRelativePathField.name, () => {
  it('accepts valid paths', () => {
    validateRelativePathField('path/to/project', 'projectFolder');
    validateRelativePathField('project', 'projectFolder');
    validateRelativePathField('.', 'projectFolder');
    validateRelativePathField('..', 'projectFolder');
    validateRelativePathField('../path/to/project', 'projectFolder');
  });

  it('should throw an error if the path is not relative', () => {
    expect(() =>
      validateRelativePathField('C:/path/to/project', 'projectFolder')
    ).toThrowErrorMatchingSnapshot();
    expect(() =>
      validateRelativePathField('/path/to/project', 'publishFolder')
    ).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path ends in a trailing slash', () => {
    expect(() => validateRelativePathField('path/to/project/', 'someField')).toThrowErrorMatchingSnapshot();
    expect(() => validateRelativePathField('p/', 'someField')).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path contains backslashes', () => {
    expect(() => validateRelativePathField('path\\to\\project', 'someField')).toThrowErrorMatchingSnapshot();
    expect(() => validateRelativePathField('path\\', 'someOtherField')).toThrowErrorMatchingSnapshot();
  });

  it('should throw an error if the path is not normalized', () => {
    expect(() => validateRelativePathField('path/../to/project', 'someField')).toThrowErrorMatchingSnapshot();
    expect(() => validateRelativePathField('path/./to/project', 'someField')).toThrowErrorMatchingSnapshot();
    expect(() => validateRelativePathField('./path/to/project', 'someField')).toThrowErrorMatchingSnapshot();
  });
});
