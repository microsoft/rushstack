// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { removeSecretEnvironmentVariables } from './SecretEnvironmentVariables';

// Jest runs this file before each test file loads ("setupFiles" in config/jest.config.json). Many tests copy the
// process environment into a request, a fixture or a launcher's context, and a failed assertion can print such a
// copy. Deleting the variables that can hold a secret keeps their values out of that output.
//
// This changes only the process.env that jest gives the test file. A child process that a test starts without an
// `env` option still inherits the environment of the jest worker.
removeSecretEnvironmentVariables(process.env);
