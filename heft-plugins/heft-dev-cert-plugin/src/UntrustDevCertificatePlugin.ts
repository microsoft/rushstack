// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import TrustDevCertificatePlugin from './TrustDevCertificatePlugin';

const PLUGIN_NAME: string = 'UntrustDevCertPlugin';

export default class UntrustDevCertificatePlugin extends TrustDevCertificatePlugin {
  public constructor() {
    super(/* pluginName: */ PLUGIN_NAME, /* trustDevCert: */ false);
  }
}
