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

# Integration test in sandbox repo

Sandbox repo folder: **build-tests/rush-redis-cobuild-plugin-integration-test/sandbox/repo**

```sh
cd sandbox/repo
rush update
```

## Case 1: Disable cobuild by setting `RUSH_COBUILD_ENABLED=0`

```sh
rm -rf common/temp/build-cache && RUSH_COBUILD_ENABLED=0 node ../../lib/runRush.js --debug cobuild
```

Expected behavior: Cobuild feature is disabled. Run command successfully.

```sh
RUSH_COBUILD_ENABLED=0 node ../../lib/runRush.js --debug cobuild
```

Expected behavior: Cobuild feature is disabled. Build cache was restored successfully.

## Case 2: Cobuild enabled, run one cobuild command only

1. Clear redis server

```sh
(cd ../.. && docker compose down && docker compose up -d)
```

2. Run `rush cobuild` command

```sh
rm -rf common/temp/build-cache && node ../../lib/runRush.js --debug cobuild
```

Expected behavior: Cobuild feature is enabled. Run command successfully.
You can also see cobuild related logs in the terminal.

```sh
Get completed state for cobuild:v1::c2df36270ec5faa8ef6497fa7367a476de3e2861:completed: null
Acquired lock for cobuild:v1::c2df36270ec5faa8ef6497fa7367a476de3e2861:lock: 1, 1 is success
Set completed state for cobuild:v1::c2df36270ec5faa8ef6497fa7367a476de3e2861:completed: SUCCESS;c2df36270ec5faa8ef6497fa7367a476de3e2861
```

## Case 3: Cobuild enabled, run two cobuild commands in parallel

> Note: This test requires Visual Studio Code to be installed.

1. Clear redis server

```sh
(cd ../.. && docker compose down && docker compose up -d)
```

2. Clear build cache

```sh
rm -rf common/temp/build-cache
```

3. Open predefined `.vscode/redis-cobuild.code-workspace` in Visual Studio Code.

4. Open command palette (Ctrl+Shift+P or Command+Shift+P) and select `Tasks: Run Task` and select `cobuild`.

> In this step, two dedicated terminal windows will open. Running `rush cobuild` command under sandbox repo respectively.

Expected behavior: Cobuild feature is enabled, cobuild related logs out in both terminals.

## Case 4: Cobuild enabled, run two cobuild commands in parallel, one of them failed

> Note: This test requires Visual Studio Code to be installed.

1. Making the cobuild command of project "A" fails

**sandbox/repo/projects/a/package.json**

```diff
  "scripts": {
-   "cobuild": "node ../build.js a",
+   "cobuild": "sleep 5 && exit 1",
    "build": "node ../build.js a"
  }
```

2. Clear redis server

```sh
(cd ../.. && docker compose down && docker compose up -d)
```

3. Clear build cache

```sh
rm -rf common/temp/build-cache
```

4. Open predefined `.vscode/redis-cobuild.code-workspace` in Visual Studio Code.

5. Open command palette (Ctrl+Shift+P or Command+Shift+P) and select `Tasks: Run Task` and select `cobuild`.

Expected behavior: Cobuild feature is enabled, cobuild related logs out in both terminals. These two cobuild commands fail because of the failing build of project "A". And, one of them restored the failing build cache created by the other one.
