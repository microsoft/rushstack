// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The key of the annotation that is attached to every object loaded from a configuration file, which records the
 * source file and the original property values.
 *
 * @remarks
 * This module has no dependencies, so that tools can recognize (and produce) annotated objects without loading
 * the rest of this package.
 */
export const CONFIGURATION_FILE_FIELD_ANNOTATION: unique symbol = Symbol(
  'configuration-file-field-annotation'
);
