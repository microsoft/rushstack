// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is an internal part of the plugin infrastructure.
 *
 * @remarks
 * This object is the constructor parameter for API Documenter plugin features.
 *
 * @public
 */
export class PluginFeatureInitialization {
  /** @internal */
  public constructor() {
    // reserved for future use
  }
}

/**
 * The abstract base class for all API Documenter plugin features.
 * @public
 */
export abstract class PluginFeature {
  /**
   * The subclass should pass the `initialization` through to the base class.
   * Do not put custom initialization code in the constructor.  Insteadm perform your initialization in the
   * `onInitialized()` event function.
   * @internal
   */
  public constructor(initialization: PluginFeatureInitialization) {
    // reserved for future expansion
  }

  /**
   * This event function is called after the feature is initialized, but before any processing occurs.
   * @virtual
   */
  public onInitialized(): void {
    // (implemented by child class)
  }
}
