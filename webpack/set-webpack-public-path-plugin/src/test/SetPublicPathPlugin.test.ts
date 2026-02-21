// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SetPublicPathPlugin, type ISetWebpackPublicPathPluginOptions } from '../SetPublicPathPlugin.ts';
import { testForPlugin } from './testBase.ts';

const options: ISetWebpackPublicPathPluginOptions[] = [
  { scriptName: { useAssetName: true } },
  {
    scriptName: {
      name: 'foobar.js'
    }
  },
  {
    scriptName: {
      name: '[name]_[hash].js',
      isTokenized: true
    }
  },
  {
    scriptName: { useAssetName: true },
    regexVariable: 'REGEXP_VAR'
  }
];
for (const pluginOptions of options) {
  testForPlugin(
    `${SetPublicPathPlugin.name} (with ${JSON.stringify(pluginOptions)}})`,
    () =>
      new SetPublicPathPlugin({
        scriptName: {
          useAssetName: true
        }
      })
  );
}
