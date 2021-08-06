// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for using Storybook during the "test" stage.
 *
 * @packageDocumentation
 */

import type { IHeftPlugin } from '@rushstack/heft';
import { StorybookPlugin } from './StorybookPlugin';

/**
 * @internal
 */
export default new StorybookPlugin() as IHeftPlugin;
