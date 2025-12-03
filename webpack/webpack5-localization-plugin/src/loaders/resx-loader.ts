// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import { Terminal } from '@rushstack/terminal';
import { parseResx } from '@rushstack/localization-utilities';

import type { IResxLocLoaderOptions } from './IResxLoaderOptions';
import { createLoader } from './LoaderFactory';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider';

const loader: LoaderDefinitionFunction<IResxLocLoaderOptions> = createLoader(
  (content: string, filePath: string, context: LoaderContext<IResxLocLoaderOptions>) => {
    const options: IResxLocLoaderOptions = context.getOptions();
    const terminal: Terminal = new Terminal(LoaderTerminalProvider.getTerminalProviderForLoader(context));

    return parseResx({
      content,
      filePath,
      terminal,
      resxNewlineNormalization: options.resxNewlineNormalization,
      ignoreMissingResxComments: !options.ignoreMissingResxComments,
      ignoreString: options.ignoreString
    });
  }
);

export default loader;
