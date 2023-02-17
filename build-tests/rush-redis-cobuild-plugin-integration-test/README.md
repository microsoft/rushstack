# About
This package enables integration testing of the `RedisCobuildLockProvider` by connecting to an actual Redis created using an [redis](https://hub.docker.com/_/redis) docker image.

# Prerequisites
Docker and docker compose must be installed

# Start the Redis
In this folder run `docker-compose up -d`

# Stop the Redis
In this folder run `docker-compose down`

# Install and build the integration test code

```sh
rush update
rush build -t rush-redis-cobuild-plugin-integration-test
```

# Run the test for lock provider

```sh
# start the docker container: docker-compose up -d
# build the code: rushx build
rushx test-lock-provider
```

# Testing cobuild

> Note: This test requires Visual Studio Code to be installed.

1. Open predefined `.vscode/redis-cobuild.code-workspace` in Visual Studio Code.

2. Open Command Palette (Ctrl+Shift+P or Command+Shift+P) and select `Tasks: Run Task` and select `cobuild`.

3. Two new terminal windows will open. Both running `rush cobuild` command under sandbox repo.
