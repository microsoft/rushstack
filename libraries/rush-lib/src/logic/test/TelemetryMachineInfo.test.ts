// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:os', () => {
  const actual: typeof import('node:os') = jest.requireActual('node:os');
  function createCpu(model: string): import('node:os').CpuInfo {
    return { model, speed: 3000, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } };
  }
  // Node.js sometimes pads the model. The models differ, so the test can tell which CPU's model is reported.
  const cpus: import('node:os').CpuInfo[] = [
    createCpu('Test CPU @ 3.00GHz   '),
    createCpu('Second CPU'),
    createCpu('Third CPU')
  ];
  return {
    ...actual,
    cpus: jest.fn(() => cpus),
    freemem: jest.fn(actual.freemem),
    totalmem: jest.fn(actual.totalmem)
  };
});

import * as os from 'node:os';

import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import { RushSession } from '../../pluginFramework/RushSession';
import { Telemetry, type ITelemetryData, type ITelemetryMachineInfo } from '../Telemetry';

const ONE_MEBIBYTE: number = 1024 * 1024;

const mockedCpus: jest.MockedFunction<typeof os.cpus> = jest.mocked(os.cpus);
const mockedFreemem: jest.MockedFunction<typeof os.freemem> = jest.mocked(os.freemem);
const mockedTotalmem: jest.MockedFunction<typeof os.totalmem> = jest.mocked(os.totalmem);

const logData: ITelemetryData = {
  name: 'build',
  durationInSeconds: 1,
  result: 'Succeeded'
};

function createTelemetry(): Telemetry {
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    `${__dirname}/telemetry/telemetryEnabled.json`
  );
  const rushSession: RushSession = new RushSession({
    terminalProvider: new ConsoleTerminalProvider(),
    getIsDebugMode: () => false
  });
  return new Telemetry(rushConfiguration, rushSession);
}

describe(`${Telemetry.name} machine info`, () => {
  // Telemetry keeps the CPU values for the rest of the process, and each test file gets its own module
  // registry, so one test covers both the first read and the later entries.
  it('reads the CPUs once per process, and the total and free memory for each entry', () => {
    const telemetry: Telemetry = createTelemetry();
    const secondTelemetry: Telemetry = createTelemetry();
    // Other modules can read the CPUs while they load, so count only the reads from here on.
    mockedCpus.mockClear();
    mockedTotalmem
      .mockReturnValueOnce(1000 * ONE_MEBIBYTE)
      .mockReturnValueOnce(2000 * ONE_MEBIBYTE)
      .mockReturnValueOnce(3000 * ONE_MEBIBYTE);
    mockedFreemem
      .mockReturnValueOnce(100 * ONE_MEBIBYTE)
      .mockReturnValueOnce(200 * ONE_MEBIBYTE)
      .mockReturnValueOnce(300 * ONE_MEBIBYTE);

    const suppliedMachineInfo: ITelemetryMachineInfo = {
      machineArchitecture: 'arm64',
      machineCpu: 'Supplied CPU',
      machineCores: 1,
      machineTotalMemoryMiB: 1,
      machineFreeMemoryMiB: 1
    };
    telemetry.log({ ...logData, machineInfo: suppliedMachineInfo });
    expect(mockedCpus).not.toHaveBeenCalled();

    telemetry.log(logData);
    telemetry.log(logData);
    secondTelemetry.log(logData);
    expect(mockedCpus).toHaveBeenCalledTimes(1);

    const expectedCpuInfo: Pick<
      ITelemetryMachineInfo,
      'machineArchitecture' | 'machineCpu' | 'machineCores'
    > = {
      machineArchitecture: os.arch(),
      machineCpu: 'Test CPU @ 3.00GHz',
      machineCores: 3
    };
    expect(telemetry.store.map((data: ITelemetryData) => data.machineInfo)).toEqual([
      suppliedMachineInfo,
      { ...expectedCpuInfo, machineTotalMemoryMiB: 1000, machineFreeMemoryMiB: 100 },
      { ...expectedCpuInfo, machineTotalMemoryMiB: 2000, machineFreeMemoryMiB: 200 }
    ]);
    expect(secondTelemetry.store[0].machineInfo).toEqual({
      ...expectedCpuInfo,
      machineTotalMemoryMiB: 3000,
      machineFreeMemoryMiB: 300
    });
  });
});
