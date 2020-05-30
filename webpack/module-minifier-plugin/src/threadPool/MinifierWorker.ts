import { minifySingleFile } from '../terser/MinifySingleFile';
import { MinifyOptions } from 'terser';
import * as workerThreads from 'worker_threads';

const terserOptions: MinifyOptions = workerThreads.workerData;

// Set to non-zero to help debug unexpected graceful exit
process.exitCode = 2;

workerThreads.parentPort!.on("message", (message) => {
    if (!message) {
        process.exit(0);
    }

    const {
        hash,
        code: source
    } = message;

    const {
      error,
      code: minified,
      extractedComments
    } = minifySingleFile(source, terserOptions);

    workerThreads.parentPort!.postMessage({
        hash,
        error: error && error.toString(),
        code: minified,
        extractedComments
    });
});
