// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const path: string = requireFolder({
  sources: [
    {
      globsBase: './assets',
      globPatterns: ['**/*.*']
    }
  ],
  outputFolder: 'assets_[hash]'
});

// eslint-disable-next-line no-console
console.log(path);
// eslint-disable-next-line no-console
console.log(typeof requireFolder);
