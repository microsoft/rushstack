// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineAction } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/node-core-library';

import type { HeftConfiguration } from '../../configuration/HeftConfiguration';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { LoggingManager } from '../../pluginFramework/logging/LoggingManager';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';

export interface IHeftActionOptions {
  internalHeftSession: InternalHeftSession;
  terminal: ITerminal;
  loggingManager: LoggingManager;
  metricsCollector: MetricsCollector;
  heftConfiguration: HeftConfiguration;
}

export interface IHeftAction extends CommandLineAction {
  readonly terminal: ITerminal;
  readonly loggingManager: LoggingManager;
  readonly metricsCollector: MetricsCollector;
  readonly heftConfiguration: HeftConfiguration;
  readonly verbose: boolean;
}
