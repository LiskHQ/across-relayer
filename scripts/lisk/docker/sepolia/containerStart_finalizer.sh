#!/bin/bash
set -eu

. $(dirname $(realpath "$0"))/sourceCommonEnv.sh

# Override SLACK_CONFIG for rebalancer to avoid noise on Slack due to the frequent restarts
echo "SLACK_CONFIG=" >> ${env_file}

# Set the bot identifier
echo "BOT_IDENTIFIER=LISK_SEPOLIA_ACROSS_FINALIZER"  >> ${env_file}

# Relaying OFF
echo "SEND_RELAYS=false" >> ${env_file}

# Finalizer specific settings
echo "FINALIZER_ENABLED=true" >> ${env_file}
echo "SEND_TRANSACTIONS=true" >> ${env_file}

FINALIZATION_STRATEGY=`echo $RELAYER_CONFIG | jq -r ."FINALIZATION_STRATEGY"`
echo "FINALIZATION_STRATEGY=$FINALIZATION_STRATEGY" >> ${env_file}

FINALIZER_MAX_TOKENBRIDGE_LOOKBACK=`echo $RELAYER_CONFIG | jq -r ."FINALIZER_MAX_TOKENBRIDGE_LOOKBACK"`
echo "FINALIZER_MAX_TOKENBRIDGE_LOOKBACK=$FINALIZER_MAX_TOKENBRIDGE_LOOKBACK" >> ${env_file}

FINALIZER_CHAINS=`echo $RELAYER_CONFIG | jq -r ."FINALIZER_CHAINS"`
echo "FINALIZER_CHAINS=$FINALIZER_CHAINS" >> ${env_file}

FINALIZER_WITHDRAWAL_TO_ADDRESSES=`echo $RELAYER_CONFIG | jq -r ."FINALIZER_WITHDRAWAL_TO_ADDRESSES"`
echo "FINALIZER_WITHDRAWAL_TO_ADDRESSES=$FINALIZER_WITHDRAWAL_TO_ADDRESSES" >> ${env_file}

# Looping mode OFF
echo "POLLING_DELAY=0" >> ${env_file}

echo "All env vars are set."

# Restart finalizer after the set interval
FINALIZER_RESTART_INTERVAL_SECONDS=`echo $RELAYER_CONFIG | jq -r ."FINALIZER_RESTART_INTERVAL_SECONDS"`
sleep $((FINALIZER_RESTART_INTERVAL_SECONDS))

node ${app_dir}/dist/index.js --finalizer --wallet awskms --keys relayerKey
