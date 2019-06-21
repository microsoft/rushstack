// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-any */
const exportedObject: any = [['A', 'STYLE 1'], ['B', 'STYLE 2']];
/* tslint:enable:no-any */

exportedObject.locals = 'locals';

/* tslint:disable:export-name */
export = exportedObject;
/* tslint:enable:export-name */
