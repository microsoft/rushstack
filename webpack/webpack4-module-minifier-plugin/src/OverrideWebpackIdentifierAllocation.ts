// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Template } from 'webpack';

import { getIdentifier } from '@rushstack/module-minifier';

// Configure webpack to use the same identifier allocation logic as Terser to maximize gzip compressibility
Template.numberToIdentifer = getIdentifier;
