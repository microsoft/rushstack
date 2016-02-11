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
  .option('notest', {
      abbr: 'n',
      flag: true,
      help: 'Skip running "gulp test" for all projects'
  })
  .callback(executeBuild)
  .help('Run "gulp nuke" and "gulp bundle" for all projects');

nomnom.parse();
