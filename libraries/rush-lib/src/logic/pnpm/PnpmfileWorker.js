const { Worker, isMainThread, parentPort } = require("worker_threads");
parentPort.on("message", async (data) => {
  console.log("worker: Received message from main thread");
  const { context } = data;
  try {
    // If a userPnpmfilePath is provided, we expect it to exist
    let transformed;
    if (userPnpmfilePath) {
      userPnpmfile = require(context.pnpmfileShimSettings?.userPnpmfilePath);
      transformed = userPnpmfile.hooks.readPackage(pkg, context)
    }
    parentPort.postMessage(transformed);
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});