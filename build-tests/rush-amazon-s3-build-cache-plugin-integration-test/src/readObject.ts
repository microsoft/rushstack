// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AmazonS3Client } from '@rushstack/rush-amazon-s3-build-cache-plugin';
import { WebClient } from '@rushstack/rush-amazon-s3-build-cache-plugin';
import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';

const webClient: WebClient = new WebClient();

const terminal: ITerminal = new Terminal(
  new ConsoleTerminalProvider({
    verboseEnabled: true,
    debugEnabled: true
  })
);

const client: AmazonS3Client = new AmazonS3Client(
  {
    accessKeyId: 'minio',
    secretAccessKey: 'minio123',
    sessionToken: undefined
  },
  {
    s3Endpoint: 'http://localhost:9000',
    s3Region: 'eu-west-1',
    isCacheWriteAllowed: true,
    s3Prefix: undefined
  },
  webClient,
  terminal
);

async function main(): Promise<void> {
  const response: Buffer | undefined = await client.getObjectAsync('rush-build-cache/testfile.txt');
  if (response) {
    if (response.toString().match('remote file from the rush build cache')) {
      // eslint-disable-next-line no-console
      console.log('✅ Success!');
    } else {
      // eslint-disable-next-line no-console
      console.log('❌ Error: response does not match the file in s3data/rush-build-cache/testfile.txt');
      process.exit(1);
    }
  } else {
    // eslint-disable-next-line no-console
    console.error('❌ Error: no response');
    process.exit(1);
  }
}
main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
