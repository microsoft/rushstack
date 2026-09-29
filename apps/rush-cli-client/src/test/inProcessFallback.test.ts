// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { formatInProcessFallbackMessage } from '../inProcessFallback';

describe(formatInProcessFallbackMessage.name, () => {
  it('ends the reason with the fallback, without a period before the semicolon', () => {
    expect(
      formatInProcessFallbackMessage(
        'The daemon does not support explicit Rushx invocations; no request was sent.'
      )
    ).toBe(
      'rush-client: The daemon does not support explicit Rushx invocations; no request was sent; ' +
        'using in-process Rush.\n'
    );
    expect(formatInProcessFallbackMessage('controllingTerminalRequired')).toBe(
      'rush-client: controllingTerminalRequired; using in-process Rush.\n'
    );
  });

  it('starts with the given client name', () => {
    expect(
      formatInProcessFallbackMessage('the daemon does not run scripts in a terminal', 'rushx-client')
    ).toBe('rushx-client: the daemon does not run scripts in a terminal; using in-process Rush.\n');
  });

  it('gives the first line of a multi-line reason on the fallback line and the other lines as details', () => {
    expect(
      formatInProcessFallbackMessage(
        'Plugins must be declared daemon-compatible. Use --no-daemon.\n\n' +
          'The compatible plugin list names plugins that are not configured: "p".\n'
      )
    ).toBe(
      'rush-client: Plugins must be declared daemon-compatible. Use --no-daemon; using in-process Rush.\n' +
        '  The compatible plugin list names plugins that are not configured: "p".\n'
    );
  });

  it('drops the colon of a first line that introduces the lines after it', () => {
    expect(
      formatInProcessFallbackMessage(
        'Error reading "/repo/common/config/rush/command-line.json":\n  Unexpected token } at 3:1\n}\n^'
      )
    ).toBe(
      'rush-client: Error reading "/repo/common/config/rush/command-line.json"; using in-process Rush.\n' +
        '    Unexpected token } at 3:1\n' +
        '  }\n' +
        '  ^\n'
    );
    // JsonFile ends the line with os.EOL.
    expect(formatInProcessFallbackMessage('Error reading "x.json":\r\n  Unexpected token')).toBe(
      'rush-client: Error reading "x.json"; using in-process Rush.\n    Unexpected token\n'
    );
  });
});
