// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a workaround for ESLint's requirement to consume shareable configurations from package names prefixed
// with "eslint-config".
//
// To remove this requirement, add this line to the top of your project's .eslintrc.js file:
//
//    require("@rushstack/eslint-patch/custom-config-package-names");
//
import { ConfigArrayFactory, Naming } from './_patch-base';

if (!ConfigArrayFactory.__loadExtendedSharableConfigPatched) {
  ConfigArrayFactory.__loadExtendedSharableConfigPatched = true;
  const originalLoadExtendedSharableConfig = ConfigArrayFactory.prototype._loadExtendedSharableConfig;

  ConfigArrayFactory.prototype._loadExtendedSharableConfig = function () {
    try {
      return originalLoadExtendedSharableConfig.apply(this, arguments);
    } catch (e) {
      // We only care about the case where extended configs are not found.
      const error: Error & { messageTemplate?: string } = e as Error & { messageTemplate?: string };
      if (!error.messageTemplate || error.messageTemplate !== 'extend-config-missing') {
        throw e;
      }
    }

    // Extend config could not be resolved from the original location. Override the normalization
    // logic to use the extended config as it was specified.
    const originalNormalize = Naming.normalizePackageName;
    try {
      Naming.normalizePackageName = (name: string, prefix: string) => name;
      return originalLoadExtendedSharableConfig.apply(this, arguments);
    } finally {
      Naming.normalizePackageName = originalNormalize;
    }
  };
}
