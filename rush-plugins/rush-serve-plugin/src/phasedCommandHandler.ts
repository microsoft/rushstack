// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'events';
import https from 'https';
import type { AddressInfo } from 'net';

import express from 'express';
import { CertificateManager, ICertificate } from '@rushstack/debug-certificate-manager';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import type {
  ILogger,
  RushConfiguration,
  RushConfigurationProject,
  RushSession,
  IPhasedCommand,
  Operation,
  ICreateOperationsContext
} from '@rushstack/rush-sdk';
import type { CommandLineStringParameter } from '@rushstack/ts-command-line';

import { PLUGIN_NAME } from './constants';
import { IRoutingRule, RushServeConfiguration } from './RushProjectServeConfigFile';

export interface IPhasedCommandHandlerOptions {
  rushSession: RushSession;
  rushConfiguration: RushConfiguration;
  command: IPhasedCommand;
  portParameterLongName: string | undefined;
}

export async function phasedCommandHandler(options: IPhasedCommandHandlerOptions): Promise<void> {
  const { rushSession, command, portParameterLongName } = options;

  const logger: ILogger = rushSession.getLogger(PLUGIN_NAME);

  let activePort: number | undefined;

  command.hooks.createOperations.tapPromise(
    {
      name: PLUGIN_NAME,
      stage: -1
    },
    async (operations: Set<Operation>, context: ICreateOperationsContext) => {
      if (!context.isInitial || !context.isWatch) {
        return operations;
      }

      const certManager: CertificateManager = new CertificateManager();

      const certificate: ICertificate = await certManager.ensureCertificateAsync(
        true, // Allow generating a new certificate
        logger.terminal
      );

      const { customParameters } = context;

      let requestedPort: number = 0;

      // If command-line.json has an existing parameter for specifying a port, use it
      const portParameter: CommandLineStringParameter | undefined = portParameterLongName
        ? (customParameters.get(portParameterLongName) as CommandLineStringParameter)
        : undefined;
      if (portParameter) {
        const rawValue: string | undefined = portParameter.value;
        const parsedValue: number = rawValue ? parseInt(rawValue, 10) : 0;
        if (isNaN(parsedValue)) {
          logger.terminal.writeErrorLine(
            `Unexpected value "${rawValue}" for parameter "${portParameterLongName}". Expected an integer.`
          );
          throw new AlreadyReportedError();
        }
        requestedPort = parsedValue;
      } else if (portParameterLongName) {
        logger.terminal.writeErrorLine(
          `Custom parameter "${portParameterLongName}" is not defined for command "${command.actionName}" in "command-line.json".`
        );
        throw new AlreadyReportedError();
      }

      const app: express.Express = express();

      const selectedProjects: ReadonlySet<RushConfigurationProject> = context.projectSelection;

      const serveConfig: RushServeConfiguration = new RushServeConfiguration();

      const routingRules: Iterable<IRoutingRule> = await serveConfig.loadProjectConfigsAsync(
        selectedProjects,
        logger.terminal
      );

      const fileRoutingRules: Map<string, IRoutingRule> = new Map();

      const wbnRegex: RegExp = /\.wbn$/i;
      function setHeaders(response: express.Response, path?: string, stat?: unknown): void {
        response.set('Access-Control-Allow-Origin', '*');
        response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        // TODO: Generalize headers and MIME types with an external database or JSON file.
        if (path && wbnRegex.test(path)) {
          response.set('X-Content-Type-Options', 'nosniff');
          response.set('Content-Type', 'application/webbundle');
        }
      }

      for (const rule of routingRules) {
        const { diskPath, servePath } = rule;
        if (rule.type === 'file') {
          const existingRule: IRoutingRule | undefined = fileRoutingRules.get(servePath);
          if (existingRule) {
            throw new Error(
              `Request to serve "${diskPath}" at "${servePath}" conflicts with existing rule to serve "${existingRule.diskPath}" from this location.`
            );
          } else {
            fileRoutingRules.set(diskPath, rule);
            app.get(servePath, (request: express.Request, response: express.Response) => {
              response.sendFile(diskPath, {
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, OPTIONS'
                }
              });
            });
          }
        } else {
          app.use(
            servePath,
            express.static(diskPath, {
              dotfiles: 'ignore',
              immutable: rule.immutable,
              index: false,
              redirect: false,
              setHeaders
            })
          );
        }
      }

      const server: https.Server = https.createServer(
        {
          cert: certificate.pemCertificate,
          key: certificate.pemKey
        },
        app
      );

      server.listen(requestedPort);
      await once(server, 'listening');

      const address: AddressInfo | undefined = server.address() as AddressInfo;
      activePort = address?.port;

      logger.terminal.writeLine(`Content is being served from:\n  https://localhost:${activePort}/`);
      if (portParameter) {
        // Hack the value of the parsed command line parameter to the actual runtime value.
        // This will cause the resolved value to be forwarded to operations that may use it.
        (portParameter as unknown as { _value?: string })._value = `${activePort}`;
      }

      return operations;
    }
  );

  command.hooks.waitingForChanges.tap(PLUGIN_NAME, () => {
    logger.terminal.writeLine(`Content is being served from:\n  https://localhost:${activePort}/`);
  });
}
