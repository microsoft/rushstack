// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Lib1Class, Lib1Interface } from 'api-extractor-lib1-test';

// This should prevent Lib1Interface from being emitted as a type-only import, even though B uses it that way.
import { Lib1Interface as Renamed } from 'api-extractor-lib1-test';

/** @ts-ignore */

// The ignore still applies past single-line comments and whitespace.

type Invalid = import('maybe-invalid-import').Invalid;

/** @public */
export type MaybeImported = [0] extends [1 & Invalid] ? never : Invalid;

/** @public */
export interface A extends Lib1Class {}

/** @public */
export interface B extends Lib1Interface {}

/** @public */
export interface C extends Renamed {}
