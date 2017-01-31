import { GulpTask } from '@microsoft/gulp-core-build';
import { IBuildConfig } from '@microsoft/gulp-core-build/lib/IBuildConfig';
import * as gulp from 'gulp';
import * as fs from 'fs';
import * as ChalkType from 'chalk';
import * as HttpType from 'http';
import * as HttpsType from 'https';
import * as pathType from 'path';
import * as gUtilType from 'gulp-util';
import * as ExpressType from 'express';

import {
  ICertificate
} from './certificates';

export interface IServeTaskConfig {
  /**
   * API server configuration
   */
  api?: {
    /**
     * The port on which to run the API server
     */
    port: number,

    /**
     * The path to the script to run as the API server
     */
    entryPath: string
  };

  /**
   * The path to the page which should open automatically after this task completes. If you prefer no page to be
   * launched, run the build with the "--nobrowser" flag
   */
  initialPage?: string;

  /**
   * The port on which to host the file server.
   */
  port?: number;

  /**
   * If true, the server should run on HTTPS
   */
  https?: boolean;

  /**
   * Path to the HTTPS key
   */
  keyPath?: string;

  /**
   * Path to the HTTPS cert
   */
  certPath?: string;

  /**
   * Path to the HTTPS PFX cert
   */
  pfxPath?: string;

  /**
   * If true, when gulp-core-build-serve is initialized and a dev certificate doesn't already exist and hasn't been
   *  specified, attempt to generate one and trust it automatically.
   *
   * @default false
   */
  tryCreateDevCertificate?: boolean;
}

interface IApiMap {
  [ route: string ]: Function;
}

export class ServeTask extends GulpTask<IServeTaskConfig> {
  public name: string = 'serve';

  public taskConfig: IServeTaskConfig = {
    api: undefined,
    https: false,
    initialPage: '/index.html',
    port: 4321,
    tryCreateDevCertificate: false
  };

  public loadSchema(): Object {
    return require('./serve.schema.json');
  }

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): void {
    /* tslint:disable:typedef */
    const gulpConnect = require('gulp-connect');
    const open = require('gulp-open');
    const http = require('http');
    const https = require('https');
    /* tslint:enable:typedef */

    const gutil: typeof gUtilType = require('gulp-util');
    const path: typeof pathType = require('path');
    const openBrowser: boolean = (process.argv.indexOf('--nobrowser') === -1);
    const portArgumentIndex: number = process.argv.indexOf('--port');
    let { port, initialPage }: IServeTaskConfig = this.taskConfig;
    const { api }: IServeTaskConfig = this.taskConfig;
    const { rootPath }: IBuildConfig = this.buildConfig;
    const httpsServerOptions: HttpsType.ServerOptions = this._loadHttpsServerOptions();

    if (portArgumentIndex >= 0 && process.argv.length > (portArgumentIndex + 1)) {
      port = Number(process.argv[portArgumentIndex + 1]);
    }

    // Spin up the connect server
    gulpConnect.server({
      https: httpsServerOptions,
      livereload: true,
      middleware: (): Function[] => [this._logRequestsMiddleware, this._enableCorsMiddleware],
      port: port,
      root: rootPath
    });

    // If an api is provided, spin it up.
    if (api) {
      let apiMap: IApiMap | { default: IApiMap };

      try {
        apiMap = require(path.join(rootPath, api.entryPath));

        if (apiMap && (apiMap as { default: IApiMap }).default) {
          apiMap = (apiMap as { default: IApiMap }).default;
        }
      } catch (e) {
        this.logError(`The api entry could not be loaded: ${api.entryPath}`);
      }

      if (apiMap) {
        console.log(`Starting api server on port ${api.port}.`);

        const express: typeof ExpressType = require('express');
        const app: ExpressType.Express = express();

        app.use(this._logRequestsMiddleware);
        app.use(this._enableCorsMiddleware);
        app.use(this._setJSONResponseContentTypeMiddleware);

        // Load the apis.
        for (const apiMapEntry in apiMap) {
          if (apiMap.hasOwnProperty(apiMapEntry)) {
            console.log(`Registring api: ${ gutil.colors.green(apiMapEntry) }`);
            app.get(apiMapEntry, apiMap[apiMapEntry]);
          }
        }

        const apiPort: number = api.port || 5432;
        if (this.taskConfig.https) {
          https.createServer(httpsServerOptions, app).listen(apiPort);
        } else {
          http.createServer(app).listen(apiPort);
        }
      }
    }

    // Spin up the browser.
    if (openBrowser) {
      let uri: string = initialPage;
      if (!initialPage.match(/^https?:\/\//)) {
        if (!initialPage.match(/^\//)) {
          initialPage = `/${initialPage}`;
        }

        uri = `${this.taskConfig.https ? 'https' : 'http'}://localhost:${port}${initialPage}`;
      }

      gulp.src('')
        .pipe(open({
          uri: uri
        }));
    }

    completeCallback();
  }

  private _logRequestsMiddleware(req: HttpType.IncomingMessage, res: HttpType.ServerResponse, next?: () => void): void {
    const { colors }: typeof gUtilType = require('gulp-util');
    /* tslint:disable:no-any */
    const ipAddress: string = (req as any).ip;
    /* tslint:enable:no-any */
    let resourceColor: ChalkType.ChalkChain = colors.cyan;

    if (req && req.url) {
      if (req.url.indexOf('.bundle.js') >= 0) {
        resourceColor = colors.green;
      } else if (req.url.indexOf('.js') >= 0) {
        resourceColor = colors.magenta;
      }

      console.log(
        [
          `  Request: `,
          `${ ipAddress ? `[${ colors.cyan(ipAddress) }] ` : `` }`,
          `'${ resourceColor(req.url) }'`
        ].join(''));
    }

    next();
  }

  private _enableCorsMiddleware(req: HttpType.IncomingMessage, res: HttpType.ServerResponse, next?: () => void): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }

  private _setJSONResponseContentTypeMiddleware(req: HttpType.IncomingMessage,
                                                res: HttpType.ServerResponse,
                                                next?: () => void): void {
    res.setHeader('content-type', 'application/json');
    next();
  }

  private _loadHttpsServerOptions(): HttpsType.ServerOptions {
    if (this.taskConfig.https) {
      const result: HttpsType.ServerOptions = {};

      // We're configuring an HTTPS server, so we need a certificate
      if (this.taskConfig.pfxPath) {
        // There's a PFX path in the config, so try that
        this.logVerbose(`Trying PFX path: ${this.taskConfig.pfxPath}`);
        if (fs.existsSync(this.taskConfig.pfxPath)) {
          try {
            result.pfx = fs.readFileSync(this.taskConfig.pfxPath);
            this.logVerbose(`Loaded PFX certificate.`);
          } catch (e) {
            this.logError(`Error loading PFX file: ${e}`);
          }
        } else {
          this.logError(`PFX file not found at path "${this.taskConfig.pfxPath}"`);
        }
      } else if (this.taskConfig.keyPath && this.taskConfig.certPath) {
        this.logVerbose(`Trying key path "${this.taskConfig.keyPath}" and cert path "${this.taskConfig.certPath}".`);
        const certExists: boolean = fs.existsSync(this.taskConfig.certPath);
        const keyExists: boolean = fs.existsSync(this.taskConfig.keyPath);

        if (keyExists && certExists) {
          try {
            result.cert = fs.readFileSync(this.taskConfig.certPath);
            result.key = fs.readFileSync(this.taskConfig.keyPath);
          } catch (e) {
            this.logError(`Error loading key or cert file: ${e}`);
          }
        } else {
          if (!keyExists) {
            this.logError(`Key file not found at path "${this.taskConfig.keyPath}`);
          }

          if (!certExists) {
            this.logError(`Cert file not found at path "${this.taskConfig.certPath}`);
          }
        }
      } else {
        const { ensureCertificate } = require('./certificates'); // tslint:disable-line
        const devCertificate: ICertificate = ensureCertificate(this.taskConfig.tryCreateDevCertificate, this);
        if (devCertificate.pemCertificate && devCertificate.pemKey) {
          result.cert = devCertificate.pemCertificate;
          result.key = devCertificate.pemKey;
        } else {
          this.logWarning('When serving in HTTPS mode, a PFX cert path or a cert path and a key path must be ' +
                          'provided, or a dev certificate must be generated and trusted. If a SSL certificate isn\'t ' +
                          'provided, a default, self-signed certificate will be used. Expect browser security ' +
                          'warnings.');
        }
      }

      return result;
    } else {
      return undefined;
    }
  }
}
