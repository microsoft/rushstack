# @rushstack/reporter

Canonical event protocol, reporter manager, NDJSON handshake protocol, and structured diagnostics contracts for Rush.

This package is released as a public beta. Exported contracts may change before the stable release.

## Implementing a Reporter

Custom reporters implement the `IReporter` interface and register with `ReporterManager` to consume event streams.

```ts
import {
  ReporterManager,
  type IReporter,
  type IReporterContext,
  type IReporterEventEnvelope
} from '@rushstack/reporter';

class ConsoleReporter implements IReporter {
  public readonly name: string = 'console-reporter';

  public async initializeAsync(context: IReporterContext): Promise<void> {
    // Set up output streams or resources
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    // Process incoming event envelopes
  }

  public async flushAsync(): Promise<void> {
    // Flush pending output
  }

  public async closeAsync(): Promise<void> {
    // Clean up resources
  }
}

const manager: ReporterManager = new ReporterManager();
manager.addReporter(new ConsoleReporter());
await manager.initializeAsync();
// Emit events...
await manager.closeAsync();
```

## Emitting Events and Diagnostics

Producers emit structured diagnostics and messages using an `IScopedReporter`. Diagnostic codes belong to the `RushDiagnosticCode` union (prefixed with `RDC_`), and passing an unknown code is rejected at compile time.

```ts
import {
  createRushDiagnostic,
  type IScopedReporter
} from '@rushstack/reporter';

const diagnostic = createRushDiagnostic('RDC_CONFIG_INVALID_JSON', {
  parameters: {
    file: { value: 'rush.json', privacy: 'public' }
  }
});

scopedReporter.emitDiagnostic(diagnostic);
```

## Adding a Rush Diagnostic

To add a new diagnostic, create a module under `src/diagnostics/codes/` using `defineRushDiagnostic`:

```ts
import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

export const rdcConfigInvalidJson: IRushDiagnosticEntry<'RDC_CONFIG_INVALID_JSON'> = defineRushDiagnostic({
  code: 'RDC_CONFIG_INVALID_JSON',
  category: 'configuration',
  defaultSeverity: 'error',
  summary: 'The configuration file {file} contains invalid JSON.'
});
```

Then register the exported `IRushDiagnosticEntry` in the `ALL_RUSH_DIAGNOSTICS` tuple in `src/diagnostics/codes/index.ts`.

## Wire Protocol

Cross-process producers and daemon implementers communicate over a Newline Delimited JSON (NDJSON) channel. Before streaming events, producers and consumers perform a handshake exchanging `IReporterHello` and `IReporterHelloAck` messages negotiated via `negotiateReporterHello` to verify `REPORTER_PROTOCOL_VERSION` compatibility and feature requirements. Individual event records are encoded using `encodeNdjsonRecord` and parsed with `NdjsonDecoder`.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/libraries/reporter/CHANGELOG.md) - Find out
  what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/reporter/)

`@rushstack/reporter` is part of the [Rush Stack](https://rushstack.io/) family of projects.
