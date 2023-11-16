// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Regular expression used to match common license file names.
 *
 * @remarks The following file names are covered via unit tests to be matched:
 *
 * - `'LICENSE'`
 * - `'LICENSE.txt'`
 * - `'LICENSE.md'`
 * - `'LICENSE-MIT.txt'`
 * - `'license'`
 * - `'license.txt'`
 */
export const LICENSE_FILES_REGEXP: RegExp = /^LICENSE(-[A-Z-]+)?(\.(txt|md))?$/i;

/**
 * Regular expression used to match common copyright statements. It is by no means exhaustive however it
 * should cover the majority of cases that we come across in the wild.
 *
 * @remarks The following copyright statements are covered via unit tests to be matched:
 *
 * - `'Copyright © 2023 FAKE-PACKAGE-MIT-LICENSE'`
 * - `'Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>'`
 * - `'Copyright 2023 Some Licenser Name'`
 *
 */
export const COPYRIGHT_REGEX: RegExp = /Copyright\s*(\(c\)|©)?\s*\d{4}\s*.*$/im;
