// This script writes multi-byte UTF-8 characters byte by byte to test proper decoding
const { setTimeout } = require('node:timers/promises');

const unicodeString = "Hello, 世界! 🎉"; // "Hello, World" in Chinese with emoji
const encoded = Buffer.from(unicodeString, 'utf8');

async function writeChars() {
  // Write each byte individually to force chunks that split multi-byte characters
  for (let i = 0; i < encoded.length; i++) {
    process.stdout.write(encoded.subarray(i, i + 1));
    // Small delay to ensure each byte is in a separate chunk
    await setTimeout(1);
  }
  process.stdout.write('\n');
}

writeChars().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
