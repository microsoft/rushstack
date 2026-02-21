// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { virtual, ISimpleInterface } from 'api-extractor-test-01';

import { RenamedReexportedClass } from './RenamedReexportedClass.ts';

/**
 * Example of a class that inherits from an externally imported class.
 * @public
 */
export class SubclassWithImport extends RenamedReexportedClass implements ISimpleInterface {
  @virtual
  public test(): void {
    console.log('test');
  }
}
