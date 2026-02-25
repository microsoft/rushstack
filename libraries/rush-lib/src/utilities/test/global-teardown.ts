// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

import { TEST_REPO_FOLDER_PATH } from '../../cli/test/TestUtils.ts';

export default async function globalTeardown(): Promise<void> {
  await FileSystem.deleteFolderAsync(TEST_REPO_FOLDER_PATH);
}
