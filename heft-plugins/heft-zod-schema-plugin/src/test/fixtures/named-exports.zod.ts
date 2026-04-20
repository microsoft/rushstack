// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

export const alphaSchema = z.object({
  alpha: z.string()
});

export const betaSchema = z.object({
  beta: z.number()
});
