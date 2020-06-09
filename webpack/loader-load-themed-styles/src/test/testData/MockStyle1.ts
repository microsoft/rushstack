// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exportedObject: any = [
  ['A', 'STYLE 1'],
  ['B', 'STYLE 2'],
];

exportedObject.locals = 'locals';

export = exportedObject;
