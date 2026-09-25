import '../bootstrap/enableStartupCaches';

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IHostPlan } from './HostPlan';
import type { HostCommandLine } from './HostCommandLine';
import {
  makeRequireStacksMatchTheHeftCommandLine,
  presentTheMainModuleAsTheHeftBin
} from './makeRequireStacksMatchTheHeftCommandLine';

const HOST_PLAN_KIND: 'heft-plan' = 'heft-plan';
const HOST_PLAN_PROTOCOL_VERSION: number = 1;
const DEBUG_TOOL_PARAMETER: '--debug' = '--debug';

const HOST_COMMAND_LINE_MODULE_PATH: string = path.join(__dirname, 'HostCommandLine.js');
const V2_START_MODULE_PATH: string = path.join(__dirname, '../start.js');
const OWN_PACKAGE_JSON_PATH: string = path.join(__dirname, '../../package.json');
const PLAN_FILE_DESCRIPTOR_ARGUMENT_PREFIX: string = '--heft-plan-fd=';
const PLAN_FILE_PATH_ARGUMENT_PREFIX: string = '--heft-plan-file=';

function readAllTextFromFileDescriptorAndCloseIt(fileDescriptor: number): string {
  try {
    return fs.readFileSync(fileDescriptor, 'utf8');
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function readAllTextFromFileAndDeleteIt(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

function readHostPlanTextFromProcessArguments(processArguments: ReadonlyArray<string>): string | undefined {
  for (const processArgument of processArguments.slice(2)) {
    if (processArgument.startsWith(PLAN_FILE_DESCRIPTOR_ARGUMENT_PREFIX)) {
      const fileDescriptorText: string = processArgument.slice(PLAN_FILE_DESCRIPTOR_ARGUMENT_PREFIX.length);
      return readAllTextFromFileDescriptorAndCloseIt(Number.parseInt(fileDescriptorText, 10));
    }
    if (processArgument.startsWith(PLAN_FILE_PATH_ARGUMENT_PREFIX)) {
      return readAllTextFromFileAndDeleteIt(processArgument.slice(PLAN_FILE_PATH_ARGUMENT_PREFIX.length));
    }
  }
  return undefined;
}

function getOwnHeftVersion(): string {
  return (require(OWN_PACKAGE_JSON_PATH) as { version: string }).version;
}

function hasDebugToolParameter(heftArguments: ReadonlyArray<string>): boolean {
  for (const heftArgument of heftArguments) {
    if (!heftArgument.startsWith('-')) {
      return false;
    }
    if (heftArgument === DEBUG_TOOL_PARAMETER) {
      return true;
    }
  }
  return false;
}

function isPlanForThisHost(plan: IHostPlan): boolean {
  return (
    plan.kind === HOST_PLAN_KIND &&
    plan.protocolVersion === HOST_PLAN_PROTOCOL_VERSION &&
    plan.heftVersion === getOwnHeftVersion() &&
    !hasDebugToolParameter(plan.argv)
  );
}

function runHostCommandLine(plan: IHostPlan): void {
  const { HostCommandLine: HostCommandLineClass } = require(HOST_COMMAND_LINE_MODULE_PATH) as {
    HostCommandLine: typeof HostCommandLine;
  };
  const hostCommandLine: HostCommandLine = new HostCommandLineClass(plan);
  hostCommandLine
    .executeAsync()
    .then(() => {
      process.exit(process.exitCode === undefined ? 0 : process.exitCode);
    })
    .catch((error) => {
      hostCommandLine.globalTerminal.writeErrorLine(error.toString());
      process.exit(1);
    });
}

function runHostFromPlanText(planText: string | undefined, hostEntryPath: string): void {
  if (planText === undefined) {
    process.stderr.write('The Heft plugin host requires --heft-plan-fd=<fd> or --heft-plan-file=<path>.\n');
    process.exit(1);
  }
  const plan: IHostPlan = JSON.parse(planText);
  const heftBinPath: string = plan.heftBinPath ?? path.resolve(hostEntryPath, '../../../bin/heft');
  process.argv = [process.argv[0], heftBinPath, ...plan.argv];
  presentTheMainModuleAsTheHeftBin(heftBinPath);
  if (plan.cwd !== undefined && plan.cwd !== process.cwd()) {
    process.chdir(plan.cwd);
  }
  if (isPlanForThisHost(plan)) {
    runHostCommandLine(plan);
  } else {
    require(V2_START_MODULE_PATH);
    makeRequireStacksMatchTheHeftCommandLine();
  }
}

runHostFromPlanText(readHostPlanTextFromProcessArguments(process.argv), process.argv[1]);
