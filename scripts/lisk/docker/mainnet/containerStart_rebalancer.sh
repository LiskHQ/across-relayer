#!/bin/bash
set -eu

. $(dirname $(realpath "$0"))/sourceCommonEnv.sh

# Override SLACK_CONFIG for rebalancer to avoid noise on Slack due to the frequent restarts
echo "SLACK_CONFIG=" >> ${env_file}

# Set the bot identifier
echo "BOT_IDENTIFIER=LISK_ACROSS_REBALANCER"  >> ${env_file}

# Looping mode OFF
echo "POLLING_DELAY=0" >> ${env_file}

echo "All env vars are set."

# Restart rebalancer after the set interval
REBALANCER_RESTART_INTERVAL_SECONDS=`echo $RELAYER_CONFIG | jq -r ."REBALANCER_RESTART_INTERVAL_SECONDS"`
sleep $((REBALANCER_RESTART_INTERVAL_SECONDS))

node ${app_dir}/dist/index.js --rebalancer --wallet awskms --keys relayerKey
