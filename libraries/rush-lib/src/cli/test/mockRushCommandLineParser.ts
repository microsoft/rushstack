// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Mock child_process so we can verify tasks are (or are not) invoked as we expect
jest.mock('node:child_process', () => jest.requireActual('./mock_child_process'));
