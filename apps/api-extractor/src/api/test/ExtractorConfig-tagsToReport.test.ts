// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { ExtractorConfig } from '../ExtractorConfig.ts';

const testDataFolder: string = path.join(__dirname, 'test-data');

describe('ExtractorConfig-tagsToReport', () => {
  it('tagsToReport merge correctly', () => {
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(
      path.join(testDataFolder, 'tags-to-report/api-extractor.json')
    );
    const { tagsToReport } = extractorConfig;
    expect(tagsToReport).toEqual({
      '@deprecated': true,
      '@eventProperty': true,
      '@myCustomTag': true,
      '@myCustomTag2': false,
      '@override': false,
      '@sealed': true,
      '@virtual': true
    });
  });
  it('Invalid tagsToReport values', () => {
    const expectedErrorMessage = `"tagsToReport" contained one or more invalid tags:
\t- @public: Release tags are always included in API reports and must not be specified
\t- @-invalid-tag-2: A TSDoc tag name must start with a letter and contain only letters and numbers`;
    expect(() =>
      ExtractorConfig.loadFileAndPrepare(
        path.join(testDataFolder, 'invalid-tags-to-report/api-extractor.json')
      )
    ).toThrowError(expectedErrorMessage);
  });
});
