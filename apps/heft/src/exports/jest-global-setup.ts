// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is implementation of the `mocked()` global API declared by `@rushstack/heft-jest`.
 * The jest-shared.config.json configuration tells Jest to execute this file when setting
 * up the test environment.  This makes the API available to each test.
 */
// eslint-disable-next-line dot-notation
global['mocked'] = function (item: unknown): unknown {
  return item;
};
