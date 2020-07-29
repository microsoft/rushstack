// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export interface IExample {
  generic: import('api-extractor-lib1-test').Lib1GenericType<
    number,
    import('api-extractor-lib1-test').Lib1Interface
  >;
}
