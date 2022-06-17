# About
This package enables integration testing of the `AmazonS3Client` by conncting to an acutal S3 endpoint created using an [min.io](https://min.io) docker image.

# Prerequisites
Docker and docker compose must be installed

# Start the S3 endpoint
In this folder run `docker-compose up -d`

# Stop the S3 endpoint
In this folder run `docker-compose down`

# Run the test
```sh
# start the docker container: docker-compose up -d
# build the code: rushx build
rushx read-s3-object
```

# Testing retries

To test that requests can be retried start the proxy server which will fail every second request:

```bash
rushx start-proxy-server
```

Update the build-cache.json file:
```json
{
  "cacheProvider": "amazon-s3",
  "amazonS3Configuration": {
    "s3Endpoint": "http://localhost:9002",
    "s3Region": "us-east-1",
    "s3Prefix": "rush-build-cache/test",
    "isCacheWriteAllowed": true
  }
}
```

Run the rush rebuild command

```bash
cd apps
cd rush
RUSH_BUILD_CACHE_CREDENTIAL="minio:minio123" node lib/start-dev.js --debug rebuild --verbose
```
