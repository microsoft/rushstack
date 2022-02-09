import { AmazonS3Client } from '@rushstack/rush-amazon-s3-build-cache-plugin';
import { WebClient } from '@rushstack/rush-amazon-s3-build-cache-plugin';
import { ConsoleTerminalProvider, ITerminal, Terminal } from '@rushstack/node-core-library';

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
      console.log('✅ Success!');
    } else {
      console.log('❌ Error: response does not match the file in s3data/rush-build-cache/testfile.txt');
      process.exit(1);
    }
  } else {
    console.error('❌ Error: no response');
    process.exit(1);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
