// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// These should get deduped with the imports from ImportDeduping2.ts

import { ISimpleInterface } from 'api-extractor-test-01';
import { ISimpleInterface as ISimpleInterface2 } from 'api-extractor-test-01';

/** @public */
export function importDeduping1(arg1: ISimpleInterface, arg2: ISimpleInterface2): void {
  console.log('Success');
}
