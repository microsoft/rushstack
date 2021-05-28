// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftPlugin } from '@rushstack/heft';

import { JestPlugin } from './JestPlugin';

/**
 * @internal
 */
export default new JestPlugin() as IHeftPlugin;
