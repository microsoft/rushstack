// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-lib3-test
 *
 * @remarks
 * This library is consumed by api-extractor-scenarios.
 *
 * @packageDocumentation
 */

export { Lib1Class } from 'api-extractor-lib1-test';

/**
 * @internalRemarks Internal remarks
 * @public
 */
export class Lib3Class {
  /**
   * I am a documented property!
   * @betaDocumentation My docs include a custom block tag!
   * @virtual @override
   */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  prop: boolean;
}
