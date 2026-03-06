// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SetPublicPathCurrentScriptPlugin } from '../SetPublicPathCurrentScriptPlugin.ts';
import { testForPlugin } from './testBase.ts';

testForPlugin(SetPublicPathCurrentScriptPlugin.name, () => new SetPublicPathCurrentScriptPlugin());
