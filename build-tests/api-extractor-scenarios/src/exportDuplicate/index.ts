// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export class X {}
export { X as Y };

/** @internal */
class A {}
// The underscore warning should get printed next to these export statements, not next to the class declaration
export { A as B };
export { A as C };
