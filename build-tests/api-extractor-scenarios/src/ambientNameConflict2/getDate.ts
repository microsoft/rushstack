// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An API that references the system `Date` global symbol.
 * @public
 */
export function getDate(): Date {
  return new Date();
}
