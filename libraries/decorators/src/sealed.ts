// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This decorator is applied to a class (but NOT member function or property).
 * It indicates that subclasses must not inherit from this class.
 * This decorator is currently used for documentation purposes only.
 * In the future, it may be enforced at runtime.
 *
 * @public
 */
export function sealed(target: Function): void {
  // Eventually we may implement runtime validation (e.g. in DEBUG builds)
  // but currently this decorator is only used by the build tools.
}
