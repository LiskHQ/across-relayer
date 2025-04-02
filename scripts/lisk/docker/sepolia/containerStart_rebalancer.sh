#!/bin/bash

. $(dirname $(realpath "$0"))/sourceCommonEnv.sh

# Set the bot identifier
echo "BOT_IDENTIFIER=LISK_SEPOLIA_ACROSS_REBALANCER"  >> ${env_file}

# Relaying OFF rebalancing ON
echo "SEND_RELAYS=false" >> ${env_file}
echo "SEND_REBALANCES=true"  >> ${env_file}

# Looping mode OFF
echo "POLLING_DELAY=0" >> ${env_file}

echo "All env vars are set."

# Restart rebalancer every minute
sleep 60

node ${app_dir}/dist/index.js --relayer --wallet awskms --keys relayerKey
