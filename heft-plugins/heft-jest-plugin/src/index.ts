// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for using Jest during the "test" stage.
 *
 * @packageDocumentation
 */

import type { IHeftPlugin } from '@rushstack/heft';
import { JestPlugin } from './JestPlugin';

/**
 * @public
 */
export default new JestPlugin() as IHeftPlugin;
