import * as sst from '@serverless-stack/resources';

export default class MyStack extends sst.Stack {
  public constructor(scope: sst.App, id: string, props?: sst.StackProps) {
    super(scope, id, props);

    // Create a HTTP API
    const api = new sst.Api(this, 'Api', {
      routes: {
        'GET /': 'lib/lambda.handler'
      }
    });

    // Show the endpoint in the output
    this.addOutputs({
      ApiEndpoint: api.url
    });
  }
}
