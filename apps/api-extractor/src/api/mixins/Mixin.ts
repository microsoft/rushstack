// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export type Constructor<T = {}> = new (...args: any[]) => T; // tslint:disable-line:no-any

/**
 * @public
 */
export type PropertiesOf<T> = { [K in keyof T]: T[K] };

export type Mixin<TBase, TMixin> = TBase & Constructor<TMixin>;
