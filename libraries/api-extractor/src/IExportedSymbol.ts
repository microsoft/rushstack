// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

/**
 * An export name and the symbol from which the export was originally defined.
 *
 * For example, suppose a class is defined as "export default class MyClass { }"
 * but exported from the package's index.ts like this:
 *
 *    export { default as _MyClass } from './MyClass';
 *
 * In this example, the exportedName is _MyClass and the followed symbol will be the
 * original definition of MyClass.
 */
export interface IExportedSymbol {
  exportedName: string;
  followedSymbol: ts.Symbol;
}