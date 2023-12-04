// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The sorted sequence of leading digits for mangled identifiers
 * Used in MinifiedIdentifier computation for converting an ordinal to a valid ECMAScript identifier
 * @public
 */
export const IDENTIFIER_LEADING_DIGITS: string = 'etnairoscdlufpm_hbgvySDIxCOwEALkMPTUFHRNBjVzGKWqQYJXZ$';

/**
 * The sorted sequence of trailing digits for mangled identifiers
 * Used in MinifiedIdentifier computation for converting an ordinal to a valid ECMAScript identifier
 * @public
 */
export const IDENTIFIER_TRAILING_DIGITS: string =
  'etnairoscdlufpm_hbg01v32y67S4985DIxCOwEALkMPTUFHRNBjVzGKWqQYJXZ$';
