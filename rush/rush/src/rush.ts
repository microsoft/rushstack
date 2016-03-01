/**
 * @file rush.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Defines routing for the rush tool
 */

/// <reference path="../typings/tsd.d.ts" />

import * as nomnom from 'nomnom';

import executeLink, { executeUnlink } from './ExecuteLink';
import executeBuild from './ExecuteBuild';

nomnom.command('link')
  .callback(executeLink)
  .help('Create node_modules symlinks for all projects');

nomnom.command('unlink')
  .callback(executeUnlink)
  .help('Remove node_modules symlinks for all projects');

nomnom.command('rebuild')
  .callback(executeBuild)
    .option('vso', {
      abbr: 'n',
      flag: true,
      help: 'Display error messages in the VisualStudio Online format'
  })
  .help('Run "gulp nuke" and "gulp bundle" for all projects');

nomnom.parse();
