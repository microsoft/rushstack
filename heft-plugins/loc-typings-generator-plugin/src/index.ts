// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for generating typings for localization files during the "build" stage.
 *
 * @packageDocumentation
 */

import type { IHeftPlugin } from '@rushstack/heft';
import { LocTypingsPlugin } from './LocTypingsPlugin';

/**
 * @internal
 */
export default new LocTypingsPlugin() as IHeftPlugin;
