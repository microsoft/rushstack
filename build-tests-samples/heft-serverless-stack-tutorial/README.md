# heft-serverless-stack-tutorial

This project illustrates usage of the
[@rushstack/heft-serverless-stack-plugin](https://www.npmjs.com/package/@rushstack/heft-serverless-stack-plugin)
plugin.  See that documentation for details.

## Running the demo

1. [Create an AWS account](https://serverless-stack.com/chapters/create-an-aws-account.html) if you don't already have one.

2. Follow the Serverless Stack [setup instructions](https://serverless-stack.com/chapters/create-an-iam-user.html) to create an IAM User and provide your access key to `aws configure`

3. Build the project using the `--sst` switch:

```shell
# Build the project
$ heft build --sst

# Deploy the stub lambda and launch the local development client
$ heft start --sst

# Jest tests are run in the usual way
$ heft test
```
