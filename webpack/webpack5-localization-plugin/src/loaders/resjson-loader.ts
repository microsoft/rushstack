// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import { parseResJson } from '@rushstack/localization-utilities';

import { createLoader, type IBaseLocLoaderOptions } from './LoaderFactory';

const loader: LoaderDefinitionFunction<IBaseLocLoaderOptions> = createLoader(
  (content: string, filePath: string, context: LoaderContext<IBaseLocLoaderOptions>) => {
    return parseResJson({
      content,
      filePath,
      ignoreString: context.getOptions().ignoreString
    });
  }
);

export default loader;
