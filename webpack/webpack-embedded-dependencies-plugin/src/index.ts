// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A webpack plugin for generating a list of embedded dependencies. Embedded dependencies are third-party packages which are being
 * bundled into your released code and are often times subject to license, security, and other legal requirements. This plugin
 * aims to make it easier to generate a list of embedded dependencies and their associated metadata, so they can be analyzed by additional tools.
 *
 * @remarks
 * The plugin also includes the ability to generate a secondary asset which contains the license text for each embedded dependency into a single file called
 * THIRD-PARTY-NOTICES.html. This is a common legal requirement for large companies deploying commercial services/products containing open source code.
 *
 * @packageDocumentation
 */

import EmbeddedDependenciesWebpackPlugin from './EmbeddedDependenciesWebpackPlugin.ts';

export type {
  IPackageData,
  IEmbeddedDependenciesWebpackPluginOptions,
  LicenseFileGeneratorFunction,
  LicenseFileName
} from './EmbeddedDependenciesWebpackPlugin.ts';

export default EmbeddedDependenciesWebpackPlugin;
