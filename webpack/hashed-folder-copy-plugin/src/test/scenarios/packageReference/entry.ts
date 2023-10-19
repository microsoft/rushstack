// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const scopedPackagePath: string = requireFolder({
  sources: [
    {
      globsBase: '@scope/scoped-package/assets',
      globPatterns: ['**/*.*']
    }
  ],
  outputFolder: 'assets_[hash]'
});

const unscopedPackagePath: string = requireFolder({
  sources: [
    {
      globsBase: 'unscoped-package/assets',
      globPatterns: ['**/*.*']
    }
  ],
  outputFolder: 'assets_[hash]'
});

// eslint-disable-next-line no-console
console.log(scopedPackagePath);
// eslint-disable-next-line no-console
console.log(unscopedPackagePath);
