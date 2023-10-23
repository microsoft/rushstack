#!/usr/bin/env node
import { Command } from 'commander';
import { makeSuppressCommand } from './suppress';
import { makeCleanupCommand } from './cleanup';

const program = new Command();

program.addCommand(makeSuppressCommand());

program.addCommand(makeCleanupCommand());

program.parse(process.argv);
