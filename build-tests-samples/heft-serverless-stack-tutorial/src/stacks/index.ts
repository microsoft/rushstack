// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import MyStack from './MyStack';
import type * as sst from '@serverless-stack/resources';

export default function main(app: sst.App): void {
  // Set default runtime for all functions
  app.setDefaultFunctionProps({
    runtime: 'nodejs14.x'
  });

  // eslint-disable-next-line
  new MyStack(app, 'my-stack');

  // Add more stacks
}
