// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Standard error used to represent incorrect user input -- for example, a project
 * name or tag that doesn't exist. Selector parsers should throw this error type
 * if the error represents direct feedback for the user.
 */
export class SelectorError extends Error {}
