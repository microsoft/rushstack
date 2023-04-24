// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftPlugin } from '@rushstack/heft';
import { IServerlessStackPluginOptions, ServerlessStackPlugin } from './ServerlessStackPlugin';

export { IServerlessStackPluginOptions };

/**
 * @internal
 */
export default new ServerlessStackPlugin() as IHeftPlugin<IServerlessStackPluginOptions>;
