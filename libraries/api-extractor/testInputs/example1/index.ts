// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import OtherName from './folder/AliasClass2';

export {
  default as MyClass, InternalClass as _InternalClass,
  PreapprovedInternalClass as _PreapprovedInternalClass,
  __proto__,
  hasOwnProperty,
  A
} from './folder/MyClass';

export { AliasClass3 as AliasClass4 } from './folder/AliasClass3';

function privateFunction(): number {
  return 123;
}

/** @public */
export function publicFunction(param: number): string {
  return 'hi' + param;
}

export { AlphaTaggedClass, BetaTaggedClass, PublicTaggedClass } from './folder/ReleaseTagTests';
