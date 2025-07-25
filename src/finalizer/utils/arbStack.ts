import {
  ChildToParentMessageStatus,
  ChildTransactionReceipt,
  ChildToParentMessageWriter,
  registerCustomArbitrumNetwork,
  ArbitrumNetwork,
} from "@arbitrum/sdk";
import {
  winston,
  convertFromWei,
  groupObjectCountsByProp,
  Contract,
  getCachedProvider,
  getUniqueLogIndex,
  Signer,
  getCurrentTime,
  getRedisCache,
  getBlockForTimestamp,
  Multicall2Call,
  CHAIN_IDs,
  TOKEN_SYMBOLS_MAP,
  getProvider,
  paginatedEventQuery,
  getNetworkName,
  getL2TokenAddresses,
  getNativeTokenSymbol,
  getTokenInfo,
  assert,
  isEVMSpokePoolClient,
  EvmAddress,
  Address,
} from "../../utils";
import { TokensBridged } from "../../interfaces";
import { HubPoolClient, SpokePoolClient } from "../../clients";
import { CONTRACT_ADDRESSES } from "../../common";
import { FinalizerPromise, CrossChainMessage } from "../types";
import { utils as sdkUtils, arch } from "@across-protocol/sdk";
import ARBITRUM_ERC20_GATEWAY_L2_ABI from "../../common/abi/ArbitrumErc20GatewayL2.json";

let LATEST_MAINNET_BLOCK: number;
let MAINNET_BLOCK_TIME: number;

type PartialArbitrumNetwork = Omit<ArbitrumNetwork, "confirmPeriodBlocks"> & {
  challengePeriodSeconds: number;
  registered: boolean;
};
// These network configs are defined in the Arbitrum SDK, and we need to register them in the SDK's memory.
// We should export this out of a common file but we don't use this SDK elsewhere currentlyl.
const ARB_ORBIT_NETWORK_CONFIGS: PartialArbitrumNetwork[] = [
  {
    // Addresses are available here:
    // https://raas.gelato.network/rollups/details/public/aleph-zero-evm
    chainId: CHAIN_IDs.ALEPH_ZERO,
    name: "Aleph Zero",
    parentChainId: CHAIN_IDs.MAINNET,
    ethBridge: {
      bridge: "0x41Ec9456AB918f2aBA81F38c03Eb0B93b78E84d9",
      inbox: "0x56D8EC76a421063e1907503aDd3794c395256AEb ",
      sequencerInbox: "0xF75206c49c1694594E3e69252E519434f1579876",
      outbox: CONTRACT_ADDRESSES[CHAIN_IDs.MAINNET][`orbitOutbox_${CHAIN_IDs.ALEPH_ZERO}`].address,
      rollup: "0x1CA12290D954CFe022323b6A6Df92113ed6b1C98",
    },
    challengePeriodSeconds: 6 * 60 * 60, // ~ 6 hours
    retryableLifetimeSeconds: 7 * 24 * 60 * 60,
    nativeToken: TOKEN_SYMBOLS_MAP.AZERO.addresses[CHAIN_IDs.MAINNET],
    isTestnet: false,
    registered: false,
    // Must be set to true for L3's
    isCustom: true,
  },
];

function getOrbitNetwork(chainId: number): PartialArbitrumNetwork | undefined {
  return ARB_ORBIT_NETWORK_CONFIGS.find((network) => network.chainId === chainId);
}
function getArbitrumOrbitFinalizationTime(chainId: number): number {
  return getOrbitNetwork(chainId)?.challengePeriodSeconds ?? 7 * 60 * 60 * 24;
}

export async function arbStackFinalizer(
  logger: winston.Logger,
  signer: Signer,
  hubPoolClient: HubPoolClient,
  spokePoolClient: SpokePoolClient,
  _l1SpokePoolClient: SpokePoolClient,
  _recipientAddresses: Address[]
): Promise<FinalizerPromise> {
  assert(isEVMSpokePoolClient(spokePoolClient));
  // Recipient addresses are just used to query events.
  const recipientAddresses = _recipientAddresses.map((address) => address.toEvmAddress());
  LATEST_MAINNET_BLOCK = hubPoolClient.latestHeightSearched;
  const hubPoolProvider = await getProvider(hubPoolClient.chainId, logger);
  MAINNET_BLOCK_TIME = (await arch.evm.averageBlockTime(hubPoolProvider)).average;
  // Now that we know the L1 block time, we can calculate the confirmPeriodBlocks.

  ARB_ORBIT_NETWORK_CONFIGS.forEach((_networkConfig) => {
    if (_networkConfig.registered) {
      return;
    }
    const networkConfig: ArbitrumNetwork = {
      ..._networkConfig,
      confirmPeriodBlocks: _networkConfig.challengePeriodSeconds / MAINNET_BLOCK_TIME,
    };
    // The network config object should be full now.
    registerCustomArbitrumNetwork(networkConfig);
    _networkConfig.registered = true;
  });

  const { chainId } = spokePoolClient;
  const networkName = getNetworkName(chainId);

  // Arbitrum orbit takes 7 days to finalize withdrawals, so don't look up events younger than that.
  const redis = await getRedisCache(logger);
  const latestBlockToFinalize = await getBlockForTimestamp(
    chainId,
    getCurrentTime() - getArbitrumOrbitFinalizationTime(chainId),
    undefined,
    redis
  );
  logger.debug({
    at: `Finalizer#${networkName}Finalizer`,
    message: `${networkName} TokensBridged event filter`,
    to: latestBlockToFinalize,
  });
  const withdrawalEvents: TokensBridged[] = [];

  // ERC20 withdrawals emit events in the erc20GatewayRouter.
  // Native token withdrawals emit events in the ArbSys contract.
  const l2ArbSys = CONTRACT_ADDRESSES[chainId].arbSys;
  const arbSys = new Contract(l2ArbSys.address, l2ArbSys.abi, spokePoolClient.spokePool.provider);
  const l2Erc20GatewayRouter = CONTRACT_ADDRESSES[chainId].erc20GatewayRouter;
  const gatewayRouter = new Contract(
    l2Erc20GatewayRouter.address,
    l2Erc20GatewayRouter.abi,
    spokePoolClient.spokePool.provider
  );
  const transferRoutedEvents = await paginatedEventQuery(
    gatewayRouter,
    gatewayRouter.filters.TransferRouted(
      null, // l1Token
      null, // from
      recipientAddresses // to
    ),
    {
      ...spokePoolClient.eventSearchConfig,
      to: latestBlockToFinalize,
    }
  );
  const uniqueGateways = new Set<string>(transferRoutedEvents.map((e) => e.args.gateway));
  const withdrawalErc20Events = (
    await sdkUtils.mapAsync([...uniqueGateways], async (erc20Gateway) => {
      const gatewayContract = new Contract(
        erc20Gateway,
        ARBITRUM_ERC20_GATEWAY_L2_ABI,
        spokePoolClient.spokePool.provider
      );
      return await paginatedEventQuery(
        gatewayContract,
        gatewayContract.filters.WithdrawalInitiated(
          null, // l1Token non-indexed
          null, // from
          recipientAddresses // to
        ),
        {
          ...spokePoolClient.eventSearchConfig,
          to: latestBlockToFinalize,
        }
      );
    })
  ).flat();
  const withdrawalNativeEvents = await paginatedEventQuery(
    arbSys,
    arbSys.filters.L2ToL1Tx(
      null, // caller, not-indexed so can't filter
      recipientAddresses // destination
    ),
    {
      ...spokePoolClient.eventSearchConfig,
      to: latestBlockToFinalize,
    }
  );
  const _withdrawalEvents = [
    ...withdrawalErc20Events.map((e) => {
      const l2Token = getL2TokenAddresses(e.args.l1Token)[chainId];
      return {
        ...e,
        amount: e.args._amount,
        l2TokenAddress: EvmAddress.from(l2Token),
      };
    }),
    ...withdrawalNativeEvents.map((e) => {
      const nativeTokenSymbol = getNativeTokenSymbol(chainId);
      const l2Token = TOKEN_SYMBOLS_MAP[nativeTokenSymbol].addresses[chainId];
      return {
        ...e,
        amount: e.args.callvalue,
        l2TokenAddress: EvmAddress.from(l2Token),
      };
    }),
  ];
  // If there are any found withdrawal initiated events, then add them to the list of TokenBridged events we'll
  // submit proofs and finalizations for.
  _withdrawalEvents.forEach(({ transactionHash, transactionIndex, ...event }) => {
    try {
      const tokenBridgedEvent: TokensBridged = {
        ...event,
        amountToReturn: event.amount,
        chainId,
        leafId: 0,
        l2TokenAddress: event.l2TokenAddress,
        txnRef: transactionHash,
        txnIndex: transactionIndex,
      };
      withdrawalEvents.push(tokenBridgedEvent);
    } catch (err) {
      logger.debug({
        at: `Finalizer#${networkName}Finalizer`,
        message: `Skipping ERC20 withdrawal event for unknown token ${event.l2TokenAddress} on chain ${networkName}`,
        event: event,
      });
    }
  });

  return await multicallArbitrumFinalizations(withdrawalEvents, signer, hubPoolClient, logger, chainId);
}

async function multicallArbitrumFinalizations(
  tokensBridged: TokensBridged[],
  hubSigner: Signer,
  hubPoolClient: HubPoolClient,
  logger: winston.Logger,
  chainId: number
): Promise<FinalizerPromise> {
  const finalizableMessages = await getFinalizableMessages(logger, tokensBridged, hubSigner, chainId);
  const callData = await Promise.all(finalizableMessages.map((message) => finalizeArbitrum(message.message, chainId)));
  const crossChainTransfers = finalizableMessages.map(({ info: { l2TokenAddress, amountToReturn } }) => {
    const { symbol, decimals } = getTokenInfo(l2TokenAddress, chainId);
    const amountFromWei = convertFromWei(amountToReturn.toString(), decimals);
    const withdrawal: CrossChainMessage = {
      originationChainId: chainId,
      l1TokenSymbol: symbol,
      amount: amountFromWei,
      type: "withdrawal",
      destinationChainId: hubPoolClient.chainId,
    };

    return withdrawal;
  });
  return {
    callData,
    crossChainMessages: crossChainTransfers,
  };
}

async function finalizeArbitrum(message: ChildToParentMessageWriter, chainId: number): Promise<Multicall2Call> {
  const l2Provider = getCachedProvider(chainId, true);
  const proof = await message.getOutboxProof(l2Provider);
  const { address, abi } = CONTRACT_ADDRESSES[CHAIN_IDs.MAINNET][`orbitOutbox_${chainId}`];
  const outbox = new Contract(address, abi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventData = (message as any).nitroWriter.event; // nitroWriter is a private property on the
  // ChildToParentMessageWriter class, which we need to form the calldata so unfortunately we must cast to `any`.
  const callData = await outbox.populateTransaction.executeTransaction(
    proof,
    eventData.position,
    eventData.caller,
    eventData.destination,
    eventData.arbBlockNum,
    eventData.ethBlockNum,
    eventData.timestamp,
    eventData.callvalue,
    eventData.data,
    {}
  );
  return {
    callData: callData.data,
    target: callData.to,
  };
}

async function getFinalizableMessages(
  logger: winston.Logger,
  tokensBridged: TokensBridged[],
  l1Signer: Signer,
  chainId: number
): Promise<
  {
    info: TokensBridged;
    message: ChildToParentMessageWriter;
    status: string;
  }[]
> {
  const allMessagesWithStatuses = await getAllMessageStatuses(tokensBridged, logger, l1Signer, chainId);
  const statusesGrouped = groupObjectCountsByProp(
    allMessagesWithStatuses,
    (message: { status: string }) => message.status
  );
  const networkName = getNetworkName(chainId);
  logger.debug({
    at: `Finalizer#${networkName}Finalizer`,
    message: `${networkName} outbox message statuses`,
    statusesGrouped,
  });
  return allMessagesWithStatuses.filter(
    (x) => x.status === ChildToParentMessageStatus[ChildToParentMessageStatus.CONFIRMED]
  );
}

async function getAllMessageStatuses(
  tokensBridged: TokensBridged[],
  logger: winston.Logger,
  mainnetSigner: Signer,
  chainId: number
): Promise<
  {
    info: TokensBridged;
    message: ChildToParentMessageWriter;
    status: string;
  }[]
> {
  // For each token bridge event, store a unique log index for the event within the arbitrum transaction hash.
  // This is important for bridge transactions containing multiple events.
  const logIndexesForMessage = getUniqueLogIndex(tokensBridged);
  return (
    await Promise.all(
      tokensBridged.map((e, i) =>
        getMessageOutboxStatusAndProof(logger, e, mainnetSigner, logIndexesForMessage[i], chainId)
      )
    )
  )
    .map((result, i) => {
      return {
        ...result,
        info: tokensBridged[i],
      };
    })
    .filter((result) => result.message !== undefined);
}

async function getMessageOutboxStatusAndProof(
  logger: winston.Logger,
  event: TokensBridged,
  l1Signer: Signer,
  logIndex: number,
  chainId: number
): Promise<{
  message: ChildToParentMessageWriter;
  status: string;
}> {
  const networkName = getNetworkName(chainId);
  const l2Provider = getCachedProvider(chainId, true);
  const receipt = await l2Provider.getTransactionReceipt(event.txnRef);
  const l2Receipt = new ChildTransactionReceipt(receipt);

  try {
    const l2ToL1Messages = await l2Receipt.getChildToParentMessages(l1Signer);
    if (l2ToL1Messages.length === 0 || l2ToL1Messages.length - 1 < logIndex) {
      const error = new Error(
        `No outgoing messages found in transaction:${event.txnRef} for l2 token ${event.l2TokenAddress}`
      );
      logger.warn({
        at: `Finalizer#${networkName}Finalizer`,
        message: "Transaction that emitted TokensBridged event unexpectedly contains 0 L2-to-L1 messages 🤢!",
        logIndex,
        l2ToL1Messages: l2ToL1Messages.length,
        event,
        reason: error.stack || error.message || error.toString(),
        notificationPath: "across-error",
      });
      throw error;
    }
    const l2Message = l2ToL1Messages[logIndex];

    // Check if already executed or unconfirmed (i.e. not yet available to be executed on L1 following dispute
    // window)
    const outboxMessageExecutionStatus = await l2Message.status(l2Provider);
    if (outboxMessageExecutionStatus === ChildToParentMessageStatus.EXECUTED) {
      return {
        message: l2Message,
        status: ChildToParentMessageStatus[ChildToParentMessageStatus.EXECUTED],
      };
    }
    if (outboxMessageExecutionStatus !== ChildToParentMessageStatus.CONFIRMED) {
      const estimatedFinalizationBlock = await l2Message.getFirstExecutableBlock(l2Provider);
      const estimatedFinalizationBlockDelta = estimatedFinalizationBlock.toNumber() - LATEST_MAINNET_BLOCK;
      logger.debug({
        at: `Finalizer#${networkName}Finalizer`,
        message: `Unconfirmed withdrawal can be finalized in ${
          (estimatedFinalizationBlockDelta * MAINNET_BLOCK_TIME) / 60 / 60
        } hours`,
        chainId,
        token: event.l2TokenAddress,
        amount: event.amountToReturn,
        receipt: l2Receipt.transactionHash,
      });
    }

    // Now that its confirmed and not executed, we can execute our
    // message in its outbox entry.
    return {
      message: l2Message,
      status: ChildToParentMessageStatus[outboxMessageExecutionStatus],
    };
  } catch (error) {
    // Likely L1 message hasn't been included in an arbitrum batch yet, so ignore it for now.
    return {
      message: undefined,
      status: ChildToParentMessageStatus[ChildToParentMessageStatus.UNCONFIRMED],
    };
  }
}
