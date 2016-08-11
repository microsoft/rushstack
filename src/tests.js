/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

var context = require.context('.', true, /.+\.test\.js?$/);

context.keys().forEach(context);

module.exports = context;
