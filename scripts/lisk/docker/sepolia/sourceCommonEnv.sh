#!/bin/bash
app_dir=/home/lisk/across-relayer
cd $app_dir
echo "Current DIR: $PWD"

# Remove previous .env var if any
readonly env_file="${app_dir}/.env"
rm -f ${env_file}

# Setting env var from secrets
secret_id=arn:aws:secretsmanager:eu-west-3:132202091885:secret:sepolia/across-relayer-dev/aws-7CIqpl
RELAYER_CONFIG=`aws --region eu-west-3 secretsmanager get-secret-value --secret-id ${secret_id} | jq --raw-output .SecretString | jq -r .`

AWSKMS_CONFIG=`echo $RELAYER_CONFIG | jq -r ."AWSKMS_CONFIG"`
echo "AWSKMS_CONFIG=$AWSKMS_CONFIG" >> ${env_file}

AWS_S3_STORAGE_CONFIG=`echo $RELAYER_CONFIG | jq -r ."AWS_S3_STORAGE_CONFIG"`
echo "AWS_S3_STORAGE_CONFIG=$AWS_S3_STORAGE_CONFIG" >> ${env_file}

RPC_PROVIDER_DRPC_11155111=`echo $RELAYER_CONFIG | jq -r ."RPC_PROVIDER_DRPC_11155111"`
echo "RPC_PROVIDER_DRPC_11155111=$RPC_PROVIDER_DRPC_11155111" >> ${env_file}

RPC_PROVIDER_TENDERLY_11155111=`echo $RELAYER_CONFIG | jq -r ."RPC_PROVIDER_TENDERLY_11155111"`
echo "RPC_PROVIDER_TENDERLY_11155111=$RPC_PROVIDER_TENDERLY_11155111" >> ${env_file}

RPC_PROVIDER_DRPC_4202=`echo $RELAYER_CONFIG | jq -r ."RPC_PROVIDER_DRPC_4202"`
echo "RPC_PROVIDER_DRPC_4202=$RPC_PROVIDER_DRPC_4202" >> ${env_file}

RPC_PROVIDER_GELATO_4202=`echo $RELAYER_CONFIG | jq -r ."RPC_PROVIDER_GELATO_4202"`
echo "RPC_PROVIDER_GELATO_4202=$RPC_PROVIDER_GELATO_4202" >> ${env_file}

HUB_CHAIN_ID=`echo $RELAYER_CONFIG | jq -r ."HUB_CHAIN_ID"`
echo "HUB_CHAIN_ID=$HUB_CHAIN_ID" >> ${env_file}

SEND_TRANSACTIONS=`echo $RELAYER_CONFIG | jq -r ."SEND_TRANSACTIONS"`
echo "SEND_TRANSACTIONS=$SEND_TRANSACTIONS" >> ${env_file}

# RPC provider configuration
echo "RPC_PROVIDERS=DRPC,GELATO,TENDERLY" >> ${env_file}
echo "RPC_PROVIDERS_11155111=DRPC,TENDERLY" >> ${env_file}
echo "RPC_PROVIDERS_4202=GELATO,DRPC" >> ${env_file}

# Testnet settings
echo "RELAYER_ORIGIN_CHAINS=[11155111,4202]" >> ${env_file}
echo "RELAYER_DESTINATION_CHAINS=[11155111,4202]" >> ${env_file}
echo "MIN_RELAYER_FEE_PCT=0.00005" >> ${env_file}

# Fee settings
echo "PRIORITY_FEE_SCALER_11155111=0.8"  >> ${env_file}
echo "RELAYER_GAS_PADDING=0"  >> ${env_file}

# Supported token settings
# Use only WETH until Across adds rebalancer support for LSK and USDT on Sepolia
# echo RELAYER_TOKENS=\'[\"0x16B840bA01e2b05fc2268eAf6d18892a11EC29D6\", \"0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0\", \"0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14\"]\'  >> ${env_file}
echo RELAYER_TOKENS=\'[\"0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14\"]\'  >> ${env_file}
echo MIN_DEPOSIT_CONFIRMATIONS=\'{ \"1000000\": { \"919\": 1, \"4202\": 1, \"80002\": 1, \"84532\": 1, \"421614\": 1, \"11155111\": 1, \"11155420\": 1 } }\' >> ${env_file}
echo RELAYER_EXTERNAL_INVENTORY_CONFIG=\'/home/lisk/across-relayer/config/sepolia/relayerExternalInventory.json\' >> ${env_file}

echo "All common env vars are set."
