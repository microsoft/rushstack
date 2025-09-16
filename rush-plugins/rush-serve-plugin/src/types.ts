// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration, RushSession, IPhasedCommand } from '@rushstack/rush-sdk';

export interface IPhasedCommandHandlerOptions {
  rushSession: RushSession;
  rushConfiguration: RushConfiguration;
  command: IPhasedCommand;
  portParameterLongName: string | undefined;
  logServePath: string | undefined;
  globalRoutingRules: IRoutingRule[];
  buildStatusWebSocketPath: string | undefined;
}
export interface IRushProjectServeJson {
  routing: IRoutingRuleJson[];
}

export interface IBaseRoutingRuleJson {
  servePath: string;
  immutable?: boolean;
}

export interface IRoutingFolderRuleJson extends IBaseRoutingRuleJson {
  projectRelativeFile: undefined;
  projectRelativeFolder: string;
}

export interface IRoutingFileRuleJson extends IBaseRoutingRuleJson {
  projectRelativeFile: string;
  projectRelativeFolder: undefined;
}

export type IRoutingRuleJson = IRoutingFileRuleJson | IRoutingFolderRuleJson;

export interface IRoutingRule {
  type: 'file' | 'folder';
  diskPath: string;
  servePath: string;
  immutable: boolean;
}
