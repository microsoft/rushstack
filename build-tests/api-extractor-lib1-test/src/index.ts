// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-lib1-test
 *
 * @remarks
 * This library is consumed by api-extractor-scenarios.
 *
 * @packageDocumentation
 */

import { Lib1ForgottenExport } from './Lib1ForgottenExport';

/** @public */
export class Lib1Class extends Lib1ForgottenExport {
  public get readonlyProperty(): string {
    return 'hello';
  }

  public get writeableProperty(): string {
    return 'hello';
  }
  public set writeableProperty(value: string) {}
}

/** @alpha */
export interface Lib1Interface {}

export { Lib1GenericType } from './Lib1GenericType';
export { Lib1Namespace } from './Lib1Namespace';
