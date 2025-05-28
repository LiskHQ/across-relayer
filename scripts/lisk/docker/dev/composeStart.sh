#!/bin/bash
set -eu

if [ ! -z "$(git status --untracked-files=no --porcelain)" ]; then
  echo "Please stash/commit your local changes and re-run the script."
  exit 1
fi

. $(dirname $(realpath "$0"))/changeToAppInstallDir.sh

. scripts/lisk/docker/dev/setEnvVariables.sh

mkdir -p $PWD/.aws
cp $HOME/.aws/credentials $PWD/.aws/
git apply scripts/lisk/docker/dev/docker-compose-dev.patch

COMPOSE_BAKE=true docker compose up --pull always --build --detach
