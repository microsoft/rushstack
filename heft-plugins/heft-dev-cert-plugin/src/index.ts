// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin to manage development certificates for local serve.
 * Automatically configures webpack-dev-server to use https in serve mode.
 *
 * @packageDocumentation
 */

import type { IHeftPlugin } from '@rushstack/heft';
import { DevCertPlugin } from './DevCertPlugin';

/**
 * @internal
 */
export default new DevCertPlugin() as IHeftPlugin;
