#!/bin/bash
set -eu

. $(dirname $(realpath "$0"))/sourceCommonEnv.sh

# API server settings
API_SERVER_HOST=`echo $RELAYER_CONFIG | jq -r ."RELAYER_1_API_SERVER_HOST"`
echo "API_SERVER_HOST=$API_SERVER_HOST" >> ${app_dir}/.env

API_SERVER_PORT=`echo $RELAYER_CONFIG | jq -r ."RELAYER_1_API_SERVER_PORT"`
echo "API_SERVER_PORT=$API_SERVER_PORT" >> ${app_dir}/.env

# Set the bot identifier
echo "BOT_IDENTIFIER=LISK_SEPOLIA_ACROSS_RELAYER_1"  >> ${env_file}

# Relaying ON rebalancing OFF
echo "SEND_RELAYS=true" >> ${env_file}
echo "SEND_REBALANCES=false"  >> ${env_file}

# Enable debug logs
echo "DEBUG_PROFITABILITY=false" >> ${env_file}

echo "All env vars are set."

node ${app_dir}/dist/index.js --relayer --wallet awskms --keys relayerKey
