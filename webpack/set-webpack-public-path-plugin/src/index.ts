/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/**
 * This simple plugin sets the `__webpack_public_path__` variable to
 *  a value specified in the arguments, optionally appended to the SystemJs baseURL
 *  property.
 */
declare const packageDescription: void;

export * from './SetPublicPathPlugin';
export {
  getGlobalRegisterCode,
  registryVariableName
} from './codeGenerator';
