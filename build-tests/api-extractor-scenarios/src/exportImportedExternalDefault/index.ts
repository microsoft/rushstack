// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { default, Lib2Class } from './importer.ts';

import { default as Base } from 'api-extractor-lib2-test';

/** @public */
export class Child extends Base {}
