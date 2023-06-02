import { EnvironmentConfiguration } from '@rushstack/rush-sdk';

export const AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID' = 'AWS_ACCESS_KEY_ID';
export const AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY' = 'AWS_SECRET_ACCESS_KEY';
export const AWS_SESSION_TOKEN: 'AWS_SESSION_TOKEN' = 'AWS_SESSION_TOKEN';

/**
 * Credentials for authorizing and signing requests to an Amazon S3 endpoint.
 *
 * @public
 */
export interface IAmazonS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
}

/**
 * Attempt to read credentials from the commonly used AWS_* env vars.
 */
export const fromAmazonEnv = (): IAmazonS3Credentials | undefined => {
  const accessKeyId: string | undefined = process.env[AWS_ACCESS_KEY_ID];
  const secretAccessKey: string | undefined = process.env[AWS_SECRET_ACCESS_KEY];
  const sessionToken: string | undefined = process.env[AWS_SESSION_TOKEN];

  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken
    };
  }

  return undefined;
};

/**
 * Attempt to parse credentials set from the RUSH_BUILD_CACHE_CREDENTIAL env var.
 */
export const fromRushEnv = (
  credential = EnvironmentConfiguration.buildCacheCredential
): IAmazonS3Credentials | undefined => {
  if (!credential) {
    return undefined;
  }

  const fields: string[] = credential.split(':');
  if (fields.length < 2 || fields.length > 3) {
    throw new Error(`Rush build cache credential is in an unexpected format.`);
  }

  return {
    accessKeyId: fields[0],
    secretAccessKey: fields[1],
    sessionToken: fields[2]
  };
};
