// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@rushstack/node-core-library';

import lockfileExplorerPackageJson from '../../package.json';

export const { version: LFX_VERSION, name: LFX_PACKAGE_NAME } = lockfileExplorerPackageJson;

let _lfxPackageRoot: string = Path.convertToSlashes(__dirname);
_lfxPackageRoot = _lfxPackageRoot.slice(
  0,
  _lfxPackageRoot.lastIndexOf('/', _lfxPackageRoot.lastIndexOf('/') - 1)
);
export const LFX_PACKAGE_ROOT: string = Path.convertToPlatformDefault(_lfxPackageRoot);
