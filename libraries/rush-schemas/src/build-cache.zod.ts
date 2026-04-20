// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import { withSchemaMeta } from '@rushstack/heft-zod-schema-plugin/lib/SchemaMetaHelpers';

// NOTE: this port intentionally does NOT include a `z.infer` alias or a drift
// check against rush-lib's existing `IBuildCacheJson` type. That type uses an
// open `[otherConfigKey: string]: JsonObject` index signature so that
// third-party cache provider plugins can add their own config blocks at
// runtime, while the JSON Schema describes a fixed set of first-party
// providers via a discriminated `oneOf`. The two shapes serve different
// purposes (runtime extensibility vs. editor-time validation) and cannot be
// reconciled by a structural assertion. This is the central pitfall of
// porting `oneOf`-style schemas: validators and TypeScript types diverge by
// design, and the schema package has to acknowledge that rather than try to
// pretend otherwise.

const entraLoginFlow: z.ZodEnum<{
  AdoCodespacesAuth: 'AdoCodespacesAuth';
  InteractiveBrowser: 'InteractiveBrowser';
  DeviceCode: 'DeviceCode';
  VisualStudioCode: 'VisualStudioCode';
  AzureCli: 'AzureCli';
  AzureDeveloperCli: 'AzureDeveloperCli';
  AzurePowerShell: 'AzurePowerShell';
}> = z.enum([
  'AdoCodespacesAuth',
  'InteractiveBrowser',
  'DeviceCode',
  'VisualStudioCode',
  'AzureCli',
  'AzureDeveloperCli',
  'AzurePowerShell'
]);

type EntraLoginFlowName = z.infer<typeof entraLoginFlow>;

const entraLoginFlowKeys: readonly EntraLoginFlowName[] = entraLoginFlow.options;

/**
 * Builds the loginFlowFailover sub-object: each known provider key maps to a
 * fallback flow that is not equal to the key itself (matching the original
 * JSON Schema's `not: { enum: [<key>] }` constraint).
 */
function buildLoginFlowFailoverShape(): z.ZodObject<
  Record<EntraLoginFlowName, z.ZodOptional<z.ZodEnum<Record<EntraLoginFlowName, EntraLoginFlowName>>>>
> {
  const shape: Record<string, z.ZodOptional<z.ZodEnum<Record<string, string>>>> = {};
  for (const key of entraLoginFlowKeys) {
    const others: EntraLoginFlowName[] = entraLoginFlowKeys.filter((other) => other !== key);
    // Reconstruct an enum without the self-fallback option.
    const optionsRecord: Record<string, string> = {};
    for (const value of others) {
      optionsRecord[value] = value;
    }
    shape[key] = z.enum(optionsRecord).optional();
  }
  return z.object(shape) as z.ZodObject<
    Record<EntraLoginFlowName, z.ZodOptional<z.ZodEnum<Record<EntraLoginFlowName, EntraLoginFlowName>>>>
  >;
}

const azureBlobStorageConfiguration: z.ZodObject<{
  storageAccountName: z.ZodString;
  storageContainerName: z.ZodString;
  azureEnvironment: z.ZodOptional<
    z.ZodEnum<{
      AzurePublicCloud: 'AzurePublicCloud';
      AzureChina: 'AzureChina';
      AzureGermany: 'AzureGermany';
      AzureGovernment: 'AzureGovernment';
    }>
  >;
  loginFlow: z.ZodOptional<typeof entraLoginFlow>;
  loginFlowFailover: z.ZodOptional<ReturnType<typeof buildLoginFlowFailoverShape>>;
  blobPrefix: z.ZodOptional<z.ZodString>;
  isCacheWriteAllowed: z.ZodOptional<z.ZodBoolean>;
  readRequiresAuthentication: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  storageAccountName: z
    .string()
    .describe('(Required) The name of the the Azure storage account to use for build cache.'),
  storageContainerName: z
    .string()
    .describe('(Required) The name of the container in the Azure storage account to use for build cache.'),
  azureEnvironment: z
    .enum(['AzurePublicCloud', 'AzureChina', 'AzureGermany', 'AzureGovernment'])
    .describe('The Azure environment the storage account exists in. Defaults to AzurePublicCloud.')
    .optional(),
  loginFlow: entraLoginFlow.optional(),
  loginFlowFailover: buildLoginFlowFailoverShape()
    .describe(
      'Optional configuration for a fallback login flow if the primary login flow fails. ' +
        'If not defined, the default order is: AdoCodespacesAuth -> VisualStudioCode -> AzureCli -> ' +
        'AzureDeveloperCli -> AzurePowerShell -> InteractiveBrowser -> DeviceCode.'
    )
    .optional(),
  blobPrefix: z.string().describe('An optional prefix for cache item blob names.').optional(),
  isCacheWriteAllowed: z
    .boolean()
    .describe('If set to true, allow writing to the cache. Defaults to false.')
    .optional(),
  readRequiresAuthentication: z
    .boolean()
    .describe('If set to true, reading the cache requires authentication. Defaults to false.')
    .optional()
});

const amazonS3Configuration: z.ZodObject<{
  s3Bucket: z.ZodOptional<z.ZodString>;
  s3Endpoint: z.ZodOptional<z.ZodString>;
  s3Region: z.ZodString;
  s3Prefix: z.ZodOptional<z.ZodString>;
  isCacheWriteAllowed: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  s3Bucket: z
    .string()
    .describe(
      '(Required unless s3Endpoint is specified) The name of the bucket to use for build cache (e.g. "my-bucket").'
    )
    .optional(),
  s3Endpoint: z
    .string()
    .describe(
      '(Required unless s3Bucket is specified) The Amazon S3 endpoint of the bucket to use for build cache ' +
        '(e.g. "my-bucket.s3.us-east-2.amazonaws.com" or "http://localhost:9000").\n' +
        'This should not include any path, use the s3Prefix to set the path.'
    )
    .optional(),
  s3Region: z
    .string()
    .describe('(Required) The Amazon S3 region of the bucket to use for build cache (e.g. "us-east-1").'),
  s3Prefix: z
    .string()
    .describe('An optional prefix ("folder") for cache items. Should not start with /')
    .optional(),
  isCacheWriteAllowed: z
    .boolean()
    .describe('If set to true, allow writing to the cache. Defaults to false.')
    .optional()
});

const tokenHandler: z.ZodObject<{ exec: z.ZodString; args: z.ZodOptional<z.ZodArray<z.ZodString>> }> =
  z.object({
    exec: z.string().describe('(Required) The command or script to execute.'),
    args: z.array(z.string()).describe('(Optional) Arguments to pass to the command or script.').optional()
  });

const httpConfiguration: z.ZodObject<{
  url: z.ZodString;
  uploadMethod: z.ZodOptional<
    z.ZodEnum<{ PUT: 'PUT'; POST: 'POST'; PATCH: 'PATCH' }>
  >;
  headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  tokenHandler: z.ZodOptional<typeof tokenHandler>;
  cacheKeyPrefix: z.ZodOptional<z.ZodString>;
  isCacheWriteAllowed: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  url: z
    .string()
    .url()
    .describe('(Required) The URL of the server that stores the caches (e.g. "https://build-caches.example.com").'),
  uploadMethod: z
    .enum(['PUT', 'POST', 'PATCH'])
    .describe('(Optional) The HTTP method to use when writing to the cache (defaults to PUT).')
    .optional(),
  headers: z
    .record(z.string(), z.string())
    .describe('(Optional) HTTP headers to pass to the cache server')
    .optional(),
  tokenHandler: tokenHandler
    .describe(
      '(Optional) Shell command that prints the authorization token needed to communicate with the HTTPS ' +
        'server and exits with code 0. This command will be executed from the root of the monorepo.'
    )
    .optional(),
  cacheKeyPrefix: z.string().describe('(Optional) prefix for cache keys.').optional(),
  isCacheWriteAllowed: z
    .boolean()
    .describe('(Optional) If set to true, allow writing to the cache. Defaults to false.')
    .optional()
});

const baseProperties: z.ZodObject<{
  $schema: z.ZodOptional<z.ZodString>;
  buildCacheEnabled: z.ZodBoolean;
  cacheProvider: z.ZodString;
  cacheEntryNamePattern: z.ZodOptional<z.ZodString>;
  cacheHashSalt: z.ZodOptional<z.ZodString>;
  azureBlobStorageConfiguration: z.ZodOptional<typeof azureBlobStorageConfiguration>;
  amazonS3Configuration: z.ZodOptional<typeof amazonS3Configuration>;
  httpConfiguration: z.ZodOptional<typeof httpConfiguration>;
}> = z.object({
  $schema: z
    .string()
    .describe(
      'Part of the JSON Schema standard, this optional keyword declares the URL of the schema that the file ' +
        'conforms to. Editors may download the schema and use it to perform syntax highlighting.'
    )
    .optional(),
  buildCacheEnabled: z.boolean().describe('Set this to true to enable the build cache feature.'),
  cacheProvider: z.string().describe('Specify the cache provider to use'),
  cacheEntryNamePattern: z
    .string()
    .describe(
      'Setting this property overrides the cache entry ID. If this property is set, it must contain a [hash] ' +
        'token. It may also contain one of the following tokens: [projectName], [projectName:normalize], ' +
        '[phaseName], [phaseName:normalize], [phaseName:trimPrefix], [os], and [arch].'
    )
    .optional(),
  cacheHashSalt: z
    .string()
    .describe(
      'An optional salt to inject during calculation of the cache key. This can be used to invalidate the ' +
        'cache for all projects when the salt changes.'
    )
    .optional(),
  azureBlobStorageConfiguration: azureBlobStorageConfiguration.optional(),
  amazonS3Configuration: amazonS3Configuration.optional(),
  httpConfiguration: httpConfiguration.optional()
});

/**
 * The zod schema describing the structure of `build-cache.json`.
 *
 * @remarks
 * The schema mirrors the original `build-cache.schema.json` discriminated
 * `oneOf` over the `cacheProvider` field. Provider-specific configuration
 * blocks (for example, `amazonS3Configuration`) are validated only when the
 * matching provider is selected.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef
export const buildCacheSchema = withSchemaMeta(
  baseProperties.and(
    z.discriminatedUnion('cacheProvider', [
      z.object({ cacheProvider: z.literal('local-only') }),
      z.object({
        cacheProvider: z.literal('azure-blob-storage'),
        azureBlobStorageConfiguration: azureBlobStorageConfiguration
      }),
      z.object({
        cacheProvider: z.literal('amazon-s3'),
        amazonS3Configuration: amazonS3Configuration
      }),
      z.object({
        cacheProvider: z.literal('http'),
        httpConfiguration: httpConfiguration
      })
    ])
  ),
  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    title: "Configuration for Rush's build cache.",
    description:
      "For use with the Rush tool, this file provides configuration options for cached project build output. See http://rushjs.io for details.",
    releaseTag: '@beta'
  }
);

export default buildCacheSchema;
