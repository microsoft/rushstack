// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';

export abstract class RushPolicy {
  public abstract validate(rushConfiguration: RushConfiguration): void;
}
