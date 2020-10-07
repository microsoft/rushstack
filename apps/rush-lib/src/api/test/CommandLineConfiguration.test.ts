// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineConfiguration } from '../CommandLineConfiguration';

describe('CommandLineConfiguration', () => {
  it('Forbids a misnamed phase', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_faze:A'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a missing phase', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          commands: [
            {
              commandKind: 'phased',
              name: 'example',
              summary: 'example',
              description: 'example',
              safeForSimultaneousRushProcesses: false,

              phases: ['_phase:A']
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a missing phase dependency', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                upstream: ['_phase:B']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                self: ['_phase:B']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a cycle among phases', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                self: ['_phase:B']
              }
            },
            {
              name: '_phase:B',
              dependencies: {
                self: ['_phase:C']
              }
            },
            {
              name: '_phase:C',
              dependencies: {
                self: ['_phase:A']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });
});
