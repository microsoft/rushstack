# @rushstack/heft-serverless-stack-plugin

This is a Heft plugin for building apps using the [Serverless Stack (SST)](https://serverless-stack.com/) framework.
With this approach, the [SST toolchain](https://docs.serverless-stack.com/packages/cli) is only used for
synthesizing CloudFormation stacks and deploying the app, and Heft takes over the role of compiling, linting,
testing your TypeScript project.

The plugin accepts two command-line parameters:

- `--sst` can be appended to `heft build` or `heft start`, causing the corresponding SST operation to be invoked

- `--sst-stage STAGE_NAME` allows you to customize the stage.  It is equivalent to the `--stage` parameter
  for the SST command-line tool.


The plugin has no effect without the `--sst` parameter.  When the parameter is provided:

- `heft build --sst` will behave similar to `sst build`, which synthesizes CloudFormation stacks
  in the `build/cdk.out/` directory.  See [this documentation](https://docs.serverless-stack.com/packages/cli#build)
  for details.  Heft's `--watch` mode is also supported.

- `heft start --sst` will behave similar to `sst start`, which deploys a
  [stub lambda](https://docs.serverless-stack.com/live-lambda-development#sst-start) to AWS
  and then launches the WebSocket client locally for debugging.  See
  [this documentation](https://docs.serverless-stack.com/packages/cli#start) for details.


> Note that `heft build --sst` currently requires AWS credentials, which limits the ability to perform this
> validation in a monorepo environment where we can't assume that every developer works on AWS.
> Issue [serverless-stack#1537](https://github.com/serverless-stack/serverless-stack/issues/1537)
> is tracking a possible improvement.

