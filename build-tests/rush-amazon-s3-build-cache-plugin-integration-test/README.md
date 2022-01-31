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
