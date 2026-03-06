// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

import express, { type Application } from 'express';
import http2express from 'http2-express-bridge';
import cors from 'cors';
import compression from 'compression';

import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import {
  type ILogger,
  type RushConfigurationProject,
  type Operation,
  type ICreateOperationsContext,
  RushConstants
} from '@rushstack/rush-sdk';
import { getProjectLogFolders } from '@rushstack/rush-sdk/lib/logic/operations/ProjectLogWritable';
import { type CommandLineIntegerParameter, CommandLineParameterKind } from '@rushstack/ts-command-line';

import { PLUGIN_NAME } from './constants.ts';
import { RushServeConfiguration } from './RushProjectServeConfigFile.ts';
import type { IRoutingRule, IPhasedCommandHandlerOptions } from './types.ts';
import {
  getLogServePathForProject,
  tryEnableBuildStatusWebSocketServer,
  type WebSocketServerUpgrader
} from './tryEnableBuildStatusWebSocketServer.ts';

export async function phasedCommandHandler(options: IPhasedCommandHandlerOptions): Promise<void> {
  const { rushSession, command, portParameterLongName, globalRoutingRules } = options;

  const logger: ILogger = rushSession.getLogger(PLUGIN_NAME);

  let activePort: number | undefined;
  // The DNS name by which this server can be accessed.
  // Defaults to 'localhost' but depends on the certificate
  let activeHostNames: readonly string[] = ['localhost'];

  function logHost(): void {
    if (activePort !== undefined) {
      logger.terminal.writeLine(
        `Content is being served from:\n  ${activeHostNames
          .map((hostName) => `https://${hostName}:${activePort}/`)
          .join('\n  ')}`
      );
    }
  }

  const webSocketServerUpgrader: WebSocketServerUpgrader | undefined =
    tryEnableBuildStatusWebSocketServer(options);

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
      const portParameter: CommandLineIntegerParameter | undefined = portParameterLongName
        ? (customParameters.get(portParameterLongName) as CommandLineIntegerParameter)
        : undefined;
      if (portParameter) {
        if (portParameter.kind !== CommandLineParameterKind.Integer) {
          throw new Error(`The "${portParameterLongName}" parameter must be an integer parameter`);
        }

        requestedPort = portParameter.value ?? 0;
      } else if (portParameterLongName) {
        logger.terminal.writeErrorLine(
          `Custom parameter "${portParameterLongName}" is not defined for command "${command.actionName}" ` +
            `in "${RushConstants.commandLineFilename}".`
        );
        throw new AlreadyReportedError();
      }

      const app: Application & { http2Request?: object; http2Response?: object } = http2express(express);

      if (app.http2Response) {
        // Hack to allow the compression middleware to be used with http2-express-bridge
        Object.defineProperty(Object.getPrototypeOf(app.http2Response), '_header', {
          get: function () {
            return this.headersSent;
          }
        });

        Object.defineProperty(Object.getPrototypeOf(app.http2Response), '_implicitHeader', {
          value: function () {
            return this.writeHead(this.statusCode);
          }
        });
      }

      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Allow access from other devices on the same network
        next();
      });

      app.options(
        '*',
        cors({
          // No options needed
        })
      );

      app.use(compression({}));

      const selectedProjects: ReadonlySet<RushConfigurationProject> = context.projectSelection;

      const serveConfig: RushServeConfiguration = new RushServeConfiguration();

      const routingRules: IRoutingRule[] = await serveConfig.loadProjectConfigsAsync(
        selectedProjects,
        logger.terminal,
        globalRoutingRules
      );

      const { logServePath } = options;
      if (logServePath) {
        for (const project of selectedProjects) {
          const projectLogServePath: string = getLogServePathForProject(logServePath, project.packageName);

          routingRules.push({
            type: 'folder',
            diskPath: getProjectLogFolders(project.projectFolder).textFolder,
            servePath: projectLogServePath,
            immutable: false
          });

          routingRules.push({
            type: 'folder',
            diskPath: getProjectLogFolders(project.projectFolder).jsonlFolder,
            servePath: projectLogServePath,
            immutable: false
          });
        }
      }

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

      const server: http2.Http2SecureServer = http2.createSecureServer(
        {
          ca: certificate.pemCaCertificate,
          cert: certificate.pemCertificate,
          key: certificate.pemKey,
          allowHTTP1: true
        },
        app
      );

      webSocketServerUpgrader?.(server);

      server.listen(requestedPort);
      command.sessionAbortController.signal.addEventListener(
        'abort',
        () => {
          server.close();
          // Don't let the HTTP/2 server keep the process alive if the user asks to quit.
          server.unref();
        },
        { once: true }
      );
      await once(server, 'listening');

      const address: AddressInfo | undefined = server.address() as AddressInfo;
      activePort = address?.port;

      if (certificate.subjectAltNames) {
        activeHostNames = certificate.subjectAltNames;
      }

      if (portParameter) {
        // Hack the value of the parsed command line parameter to the actual runtime value.
        // This will cause the resolved value to be forwarded to operations that may use it.
        (portParameter as unknown as { _value?: string })._value = `${activePort}`;
      }

      return operations;
    }
  );

  command.hooks.waitingForChanges.tap(PLUGIN_NAME, logHost);
}
