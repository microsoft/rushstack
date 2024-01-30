// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An API item with its own documentation.
 */
export const withOwnDocs = 0;

/**
 * {@inheritDoc withOwnDocs}
 */
export const inheritsFromInternal = 1;

/**
 * {@inheritDoc nonExistentTarget}
 */
export const inheritsFromInvalidInternal = 2;

/**
 * {@inheritDoc some-external-library#foo}
 */
export const inheritsFromExternal = 3;
