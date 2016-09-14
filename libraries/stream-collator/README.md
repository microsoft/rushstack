## What is Stream-Moderator?

Oftentimes, when working with multiple parallel asynchronous processes, it is helpful to ensure that their
outputs are not mixed together, as this can cause readability issues in the console or log. The
stream moderator manages the output of these streams carefully, such that no two streams are writing
at the same time. At any given time, one stream registered with the moderator is the **active stream**
which means that particular stream will be live streaming, while the others will wait for that stream
to finish before their completion.

For example, if you have 3 streams (e.g. from using `child_process.spawn()`).

Stream A will write: `AAAAA`

Stream B will write: `BBBBBBBBBBBBBBBBBBBB`

Stream C will write: `CCCCCCCCCC`

If these streams are all being piped directly to stdout, you could end up with something like:

`ABACCCBCCCCBBABBCBBABBBBBBCCAB`

**Yikes!**

Most likely, something like the following would be much more useful to users of your application:

`AAAAABBBBBBBBBBBBBBBCCCCCCCCCC`

This is where the stream-moderator comes in handy!

## Installation

Install the stream-moderator:

`npm install --save @microsoft/stream-moderator`

Import the moderator:

```javascript
import StreamModerator from '@microsoft/stream-moderator'; // es6
```

```javascript
const StreamModerator = require('@microsoft/stream-moderator'); // commonjs
```

## Usage

A stream moderator adheres to the [NodeJS Stream API](https://nodejs.org/api/stream.html), meaning that it effectively
is special type of [ReadableStream](https://nodejs.org/api/stream.html#stream_class_stream_readable). This makes
working with the stream moderator very simple. Imagine we had the 3 streams from the example above:

```javascript
const streamA = getRepeaterStream('A', 5); // fake helper function that returns a ReadableStream
const streamB = getRepeaterStream('B', 15); // fake helper function that returns a ReadableStream
const streamC = getRepeaterStream('C', 10); // fake helper function that returns a ReadableStream
```

Now, instantiate a stream moderator instance and register the streams with it:

```javascript
const moderator = new StreamModerator();

moderator.register(streamA);
moderator.register(streamB);
moderator.register(streamC);
```

`moderator` is now a stream which can be accessed with the standard stream API's. For example, you could pass the output
to process.stdout:

`moderator.pipe(process.stdout);`

Or a file:

```javascript
var wstream = fs.createWriteStream('myOutput.txt');

moderator.pipe(wstream);
```

## The active stream
At any given time, a single stream is designated as the **active stream**. The output of the active stream will always be
live-streamed. This is particularly useful for long-running streams. When the active stream finishes, a new stream
is selected as the active stream and all of its contents up to that point will be emitted. Whenever an active stream finishes,
all background streams which have been completed will be emitted.

## Helper streams
Two additional stream classes are also exported with this package:

### DualTaskStream
A utility string-based stream with two sub-streams, `stdout` and `stderr`. These streams can be written to, and will be emitted
by this class. Anything written to `stderr` will be automatically wrapped in red coloring, unless is begins with the text `Warning -`,
in which case it will write the warning to `stdout` in yellow.

### PersistentStream
A special string-based stream with a function `readAll()` which will return the contents of everything that has been written
to the stream as a string, regardless of whether the stream is open or closed.

## Improvements
NOTE: Ending the moderator stream could be improved with an option that lets you select between the following behaviors:
* Close the moderator stream when ANY registered stream has been closed
* Close the moderator stream when ALL registered streams have been closed
* Don't automatically close the moderator stream
