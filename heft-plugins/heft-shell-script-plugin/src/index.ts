// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin to run shell scripts within your project directory.
 *
 * @packageDocumentation
 */

import type { IHeftPlugin } from '@rushstack/heft';
import { IShellScriptPluginOptions, ShellScriptPlugin } from './ShellScriptPlugin';

/**
 * @public
 */
export default new ShellScriptPlugin() as IHeftPlugin<IShellScriptPluginOptions>;
