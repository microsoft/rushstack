// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Base communication layer for the SharePoint Framework
 * @remarks
 * This package defines the base communication layer for
 * the SharePoint Framework.  For REST calls, it handles authentication,
 * logging, diagnostics, and batching.  It also simplifies requests by
 * adding default headers that follow the recommended best practices.
 */
declare const packageDescription: void; // tslint:disable-line:no-unused-variable

export {
  ITheme,
  IThemingInstruction,
  loadStyles,
  loadStylesAsync,
  loadTheme,
  splitStyles,
  configureLoadStyles,
  flush
} from './loadThemedStylesHelpers';
