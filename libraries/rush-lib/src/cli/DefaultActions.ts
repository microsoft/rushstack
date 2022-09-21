// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from './RushCommandLineParser';

import { AddAction } from './actions/AddAction';
import { ChangeAction } from './actions/ChangeAction';
import { CheckAction } from './actions/CheckAction';
import { DeployAction } from './actions/DeployAction';
import { InitAction } from './actions/InitAction';
import { InitAutoinstallerAction } from './actions/InitAutoinstallerAction';
import { InitDeployAction } from './actions/InitDeployAction';
import { InstallAction } from './actions/InstallAction';
import { LinkAction } from './actions/LinkAction';
import { ListAction } from './actions/ListAction';
import { PublishAction } from './actions/PublishAction';
import { PurgeAction } from './actions/PurgeAction';
import { ScanAction } from './actions/ScanAction';
import { SetupAction } from './actions/SetupAction';
import { UnlinkAction } from './actions/UnlinkAction';
import { UpdateAction } from './actions/UpdateAction';
import { UpdateAutoinstallerAction } from './actions/UpdateAutoinstallerAction';
import { VersionAction } from './actions/VersionAction';
import { UpdateCloudCredentialsAction } from './actions/UpdateCloudCredentialsAction';

export function addDefaultRushActions(parser: RushCommandLineParser): void {
  // Alphabetical order
  parser.addAction(new AddAction(parser));
  parser.addAction(new ChangeAction(parser));
  parser.addAction(new CheckAction(parser));
  parser.addAction(new DeployAction(parser));
  parser.addAction(new InitAction(parser));
  parser.addAction(new InitAutoinstallerAction(parser));
  parser.addAction(new InitDeployAction(parser));
  parser.addAction(new InstallAction(parser));
  parser.addAction(new LinkAction(parser));
  parser.addAction(new ListAction(parser));
  parser.addAction(new PublishAction(parser));
  parser.addAction(new PurgeAction(parser));
  parser.addAction(new ScanAction(parser));
  parser.addAction(new SetupAction(parser));
  parser.addAction(new UnlinkAction(parser));
  parser.addAction(new UpdateAction(parser));
  parser.addAction(new UpdateAutoinstallerAction(parser));
  parser.addAction(new UpdateCloudCredentialsAction(parser));
  parser.addAction(new VersionAction(parser));
}
