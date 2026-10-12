// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const operationId = '@rushstack/rush-reporter#_phase:build';

export function validateHeftOutput(events, platform = process.platform) {
  const childEvents = events.filter((event) => event.parentSessionId);
  const outputEvents = events.filter(
    (event) => event.type === 'externalOutput' && event.scope?.operationId === operationId
  );
  if (
    outputEvents.some(
      (event, index) =>
        !Number.isSafeInteger(event.sequence) ||
        (index > 0 && event.sequence <= outputEvents[index - 1].sequence) ||
        (event.payload?.stream !== 'stdout' && event.payload?.stream !== 'stderr') ||
        typeof event.payload?.text !== 'string' ||
        Buffer.byteLength(event.payload.text, 'utf8') > 64 * 1024
    )
  ) {
    throw new Error('The Heft operation output was invalid, out of order, or above the chunk limit.');
  }

  if (platform === 'win32') {
    const rawOutput = outputEvents.map((event) => event.payload.text).join('');
    if (
      childEvents.length !== 0 ||
      !rawOutput.includes('---- build started ----') ||
      /"kind"\s*:\s*"hello(?:Ack)?"/.test(rawOutput)
    ) {
      throw new Error('The Windows Heft shell launcher did not preserve readable raw fallback output.');
    }
    return;
  }

  if (childEvents.length === 0) {
    throw new Error('The current Heft child did not negotiate structured reporting.');
  }
  if (
    childEvents.some(
      (event, index) =>
        !Number.isSafeInteger(event.sourceSequence) ||
        (index > 0 && event.sourceSequence <= childEvents[index - 1].sourceSequence)
    )
  ) {
    throw new Error('The current Heft child source sequence was not preserved in order.');
  }
  if (
    childEvents.some(
      (event) =>
        event.source?.packageName !== '@rushstack/heft' ||
        !event.parentRequestId ||
        !event.parentOperationId ||
        event.scope?.operationId !== event.parentOperationId
    )
  ) {
    throw new Error('The current Heft child events were not correlated to their parent operation.');
  }
}
