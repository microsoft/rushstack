// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ClientRequest, IncomingMessage } from 'node:http';
import https, { type Agent } from 'node:https';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { IDependencyMetadata, IRefCount } from '../types';
import { OperationStatus } from '../externals';

function noop(): void {
  // Do nothing.
}

const AZURE_DEVOPS_ORGANIZATION: string = `INSERT ORGANIZATION NAME HERE`;
const AUTH_HEADER: string = `AUTHORIZATION TODO`;

/**
 * Runner that queries the npm registry for a given package and version to get the authenticated Azure Blob Storage URL.
 */
export class AuthenticateOperationRunner implements IOperationRunner {
  public readonly name: string;
  // Reporting timing here would be very noisy
  public readonly reportTiming: boolean = false;
  public silent: boolean = true;
  // Has side effects
  public isSkipAllowed: boolean = false;
  // Doesn't block cache writes
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly data: IDependencyMetadata;

  private readonly _agent: IRefCount<Agent>;

  private _promise: Promise<void> | undefined;

  public constructor(name: string, data: IDependencyMetadata, agent: IRefCount<Agent>) {
    this.name = name;
    this.data = data;
    this._agent = agent;
    agent.count++;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    try {
      await this.fetchTarballURLAsync();

      return OperationStatus.Success;
    } catch (err) {
      this.silent = false;
      context.collatedWriter.terminal.writeStderrLine(`Authenticate: ${err.toString()}`);
      return OperationStatus.Failure;
    } finally {
      if (--this._agent.count === 0) {
        this._agent.ref.destroy();
      }
    }
  }

  public async fetchTarballURLAsync(): Promise<void> {
    return this._promise ?? (this._promise = this._fetchTarballURLIntenalAsync());
  }

  private async _fetchTarballURLIntenalAsync(): Promise<void> {
    const { packageName, version, tarball } = this.data;

    if (!tarball) {
      throw new Error(`No tarball for ${packageName}@${version}`);
    }

    // This prototype was optimized specifically for Azure DevOps Artifacts; replace with your configured registry. May need to revisit the API call flow
    // if the authentication bounce doesn't return a 303 for your NPM registry.
    const host: string = `${AZURE_DEVOPS_ORGANIZATION}.pkgs.visualstudio.com`;
    const pathname: string = tarball.initialPath;

    const options: https.RequestOptions = {
      // Reuse of the connection is critical to performance
      headers: { Authorization: AUTH_HEADER, Connection: 'keep-alive' },
      protocol: 'https:',
      // Set timeout at 1 minute, since that is longer than a normal install takes in total on CI.
      timeout: 60000,
      host,
      agent: this._agent.ref,
      path: pathname
    };

    // eslint-disable-next-line require-atomic-updates
    tarball.storageUrl = await this._fetchInternal(options, 3);
  }

  private async _fetchInternal(options: https.RequestOptions, retryLeft: number): Promise<string> {
    const { host, path: pathname } = options;
    try {
      const storageUrl: string = await new Promise((resolve, reject) => {
        const request: ClientRequest = https.request(options, (res: IncomingMessage) => {
          // Fully consume the stream without processing any data.
          // If we do not consume the stream, the connection cannot be reused, which kills performance.
          res.resume().on('end', noop);
          if (res.statusCode === 303) {
            // This logic is applicable to Azure DevOps Artifacts feeds; not sure if it also applies to the public npmjs registry.
            resolve(res.headers.location!);
          } else {
            reject(
              new Error(`request failed with status code ${res.statusCode}: https://${host}${pathname}`)
            );
          }
        });
        request.on('error', (e: Error) =>
          reject(new Error(`request failed\nhttps://${host}${pathname}\n${e.message}`))
        );
        request.end();
      });

      return storageUrl;
    } catch (e) {
      if (retryLeft === 0) {
        throw e;
      } else {
        return await this._fetchInternal(options, retryLeft - 1);
      }
    }
  }
}
