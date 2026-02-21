// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import { parseLocJson } from '@rushstack/localization-utilities';

import { createLoader, type IBaseLocLoaderOptions } from './LoaderFactory.ts';

const loader: LoaderDefinitionFunction<IBaseLocLoaderOptions> = createLoader(
  (content: string, filePath: string, context: LoaderContext<IBaseLocLoaderOptions>) => {
    return parseLocJson({
      content,
      filePath,
      ignoreString: context.getOptions().ignoreString
    });
  }
);

export default loader;
