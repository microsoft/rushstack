# About
This package enables integration testing of the `RedisCobuildLockProvider` by connecting to an actual Redis created using an [redis](https://hub.docker.com/_/redis) docker image.

# Prerequisites
Docker and docker compose must be installed

# Start the Redis
In this folder run `docker-compose up -d`

# Stop the Redis
In this folder run `docker-compose down`

# Run the test
```sh
# start the docker container: docker-compose up -d
# build the code: rushx build
rushx test-lock-provider
```
