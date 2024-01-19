// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SetPublicPathCurrentScriptPlugin } from '../SetPublicPathCurrentScriptPlugin';
import { testForPlugin } from './testBase';

testForPlugin(SetPublicPathCurrentScriptPlugin.name, () => new SetPublicPathCurrentScriptPlugin());
