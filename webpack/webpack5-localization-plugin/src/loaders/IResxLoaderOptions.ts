// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IParseResxOptionsBase } from '@rushstack/localization-utilities';

import type { IBaseLocLoaderOptions } from './LoaderFactory.ts';

/**
 * @public
 */
export type IResxLoaderOptions = Omit<IParseResxOptionsBase, 'terminal'>;

/**
 * @public
 */
export interface IResxLocLoaderOptions extends IResxLoaderOptions, IBaseLocLoaderOptions {}
