// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as GetHomeFolderModule from '@rushstack/node-core-library/lib/user/getHomeFolder';

export const mockGetHomeFolder: jest.MockedFunction<typeof GetHomeFolderModule.getHomeFolder> = jest.fn();
jest.mock('@rushstack/node-core-library/lib/user/getHomeFolder', (): typeof GetHomeFolderModule => ({
  getHomeFolder: mockGetHomeFolder
}));
