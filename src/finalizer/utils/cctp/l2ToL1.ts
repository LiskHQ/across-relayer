import { TransactionRequest } from "@ethersproject/abstract-provider";
import { ethers } from "ethers";
import { HubPoolClient, SpokePoolClient } from "../../../clients";
import {
  Contract,
  Signer,
  TOKEN_SYMBOLS_MAP,
  assert,
  groupObjectCountsByProp,
  Multicall2Call,
  isDefined,
  winston,
  convertFromWei,
  EventSearchConfig,
  SvmAddress,
  toPublicKey,
  chainIsSvm,
  Address,
} from "../../../utils";
import {
  AttestedCCTPDeposit,
  CCTPMessageStatus,
  getAttestedCCTPDeposits,
  getCctpMessageTransmitter,
} from "../../../utils/CCTPUtils";
import { FinalizerPromise, CrossChainMessage } from "../../types";
import { BN, web3 } from "@coral-xyz/anchor";

export async function cctpL2toL1Finalizer(
  logger: winston.Logger,
  _signer: Signer,
  hubPoolClient: HubPoolClient,
  spokePoolClient: SpokePoolClient,
  _l1SpokePoolClient: SpokePoolClient,
  senderAddresses: Address[]
): Promise<FinalizerPromise> {
  const searchConfig: EventSearchConfig = {
    from: spokePoolClient.eventSearchConfig.from,
    to: spokePoolClient.latestHeightSearched,
    maxLookBack: spokePoolClient.eventSearchConfig.maxLookBack,
  };

  const finalizingFromSolana = chainIsSvm(spokePoolClient.chainId);
  const augmentedSenderAddresses = finalizingFromSolana
    ? augmentSendersListForSolana(senderAddresses, spokePoolClient)
    : senderAddresses;

  const outstandingDeposits = await getAttestedCCTPDeposits(
    augmentedSenderAddresses,
    spokePoolClient.chainId,
    hubPoolClient.chainId,
    spokePoolClient.chainId,
    searchConfig
  );

  const unprocessedMessages = outstandingDeposits.filter(
    ({ status, attestation }) => status === "ready" && attestation !== "PENDING"
  );
  const statusesGrouped = groupObjectCountsByProp(
    outstandingDeposits,
    (message: { status: CCTPMessageStatus }) => message.status
  );
  logger.debug({
    at: `Finalizer#CCTPL2ToL1Finalizer:${spokePoolClient.chainId}`,
    message: `Detected ${unprocessedMessages.length} ready to finalize messages for CCTP ${spokePoolClient.chainId} to L1`,
    statusesGrouped,
  });

  const { address, abi } = getCctpMessageTransmitter(spokePoolClient.chainId, hubPoolClient.chainId);
  const l1MessengerContract = new ethers.Contract(address, abi, hubPoolClient.hubPool.provider);

  return {
    crossChainMessages: await generateWithdrawalData(
      unprocessedMessages,
      spokePoolClient.chainId,
      hubPoolClient.chainId
    ),
    callData: await generateMultiCallData(l1MessengerContract, unprocessedMessages),
  };
}

/**
 * Generates a series of populated transactions that can be consumed by the Multicall2 contract.
 * @param messageTransmitter The CCTPMessageTransmitter contract that will be used to populate the transactions.
 * @param messages The messages to generate transactions for.
 * @returns A list of populated transactions that can be consumed by the Multicall2 contract.
 */
async function generateMultiCallData(
  messageTransmitter: Contract,
  messages: Pick<AttestedCCTPDeposit, "attestation" | "messageBytes">[]
): Promise<Multicall2Call[]> {
  assert(messages.every((message) => isDefined(message.attestation)));
  return Promise.all(
    messages.map(async (message) => {
      const txn = (await messageTransmitter.populateTransaction.receiveMessage(
        message.messageBytes,
        message.attestation
      )) as TransactionRequest;
      return {
        target: txn.to,
        callData: txn.data,
      };
    })
  );
}

/**
 * Generates a list of valid withdrawals for a given list of CCTP messages.
 * @param messages The CCTP messages to generate withdrawals for.
 * @param originationChainId The chain that these messages originated from
 * @param destinationChainId The chain that these messages will be executed on
 * @returns A list of valid withdrawals for a given list of CCTP messages.
 */
async function generateWithdrawalData(
  messages: Pick<AttestedCCTPDeposit, "amount">[],
  originationChainId: number,
  destinationChainId: number
): Promise<CrossChainMessage[]> {
  return messages.map((message) => ({
    l1TokenSymbol: "USDC", // Always USDC b/c that's the only token we support on CCTP
    amount: convertFromWei(message.amount, TOKEN_SYMBOLS_MAP.USDC.decimals),
    type: "withdrawal",
    originationChainId,
    destinationChainId,
  }));
}

/**
 * When finalizing CCTP token transfers from Solana to Ethereum, especially transfers from the SpokePool, it's not enough
 * to have SpokePool address in the `senderAddresses`. We instead need SpokePool's `statePda` in there, because that is
 * what gets recorded as `depositor` in the `DepositForBurn` event
 */
function augmentSendersListForSolana(senderAddresses: Address[], spokePoolClient: SpokePoolClient): Address[] {
  const spokeAddress = spokePoolClient.spokePoolAddress;
  // This format is taken from `src/finalizer/index.ts`
  if (senderAddresses.some((address) => address.eq(spokeAddress))) {
    const seed = new BN("0"); // Seed is always 0 for the state account PDA in public networks.
    const [_statePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), seed.toArrayLike(Buffer, "le", 8)],
      toPublicKey(spokeAddress.toBase58())
    );
    // This format has to match format in CCTPUtils.ts >
    const statePda = SvmAddress.from(_statePda.toBase58());
    return [...senderAddresses, statePda];
  } else {
    return senderAddresses;
  }
}
