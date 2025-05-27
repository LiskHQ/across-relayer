#!/bin/bash
set -eu

. $(dirname $(realpath "$0"))/changeToAppInstallDir.sh

. scripts/lisk/docker/dev/setEnvVariables.sh

COMPOSE_BAKE=true docker compose down --rmi all

git apply -R scripts/lisk/docker/dev/docker-compose-dev.patch
rm -rf $PWD/.aws
