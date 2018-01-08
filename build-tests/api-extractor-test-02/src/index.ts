// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AmbientConsumer, virtual, ISimpleInterface } from 'api-extractor-test-01';

/**
 * @public
 */
export class Subclass extends AmbientConsumer implements ISimpleInterface {
  @virtual
  public test(): void {
    console.log('test');
  }
}
