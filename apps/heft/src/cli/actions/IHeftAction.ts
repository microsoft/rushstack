// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineAction } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import type { HeftConfiguration } from '../../configuration/HeftConfiguration.ts';
import type { MetricsCollector } from '../../metrics/MetricsCollector.ts';
import type { LoggingManager } from '../../pluginFramework/logging/LoggingManager.ts';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession.ts';
import type { HeftPhase } from '../../pluginFramework/HeftPhase.ts';

export interface IHeftActionOptions {
  readonly internalHeftSession: InternalHeftSession;
  readonly heftConfiguration: HeftConfiguration;
  readonly terminal: ITerminal;
  readonly loggingManager: LoggingManager;
  readonly metricsCollector: MetricsCollector;
  readonly watch?: boolean;
}

export interface IHeftAction extends CommandLineAction {
  readonly watch: boolean;
  readonly selectedPhases: ReadonlySet<HeftPhase>;
}
