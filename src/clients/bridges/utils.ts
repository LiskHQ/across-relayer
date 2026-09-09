import { Log } from "../../interfaces";
import { BigNumber, isDefined, toBN, EvmAddress } from "../../utils";
import { getRedisCache } from "../../cache/Redis";

/**
 * @notice This function is designed to be used in L2 chain adapters when identifying "finalized" cross
 * chain transfers. For certain L2 chains, sending WETH from L1 to L2 is impossible so the EOA is forced to
 * first unwrap the WETH into ETH via the AtomicWethDepositor contract before receiving ETH to their L2 EOA. As
 * a final step, the EOA must wrap the ETH back into WETH. This function is designed to be used to match the
 * receipt of ETH on L2 with the wrapping of ETH into WETH on L2 to produce a single stream of "finalized" cross
 * chain transfers.
 * @dev Wrapping sweeps the relayer's whole ETH balance down to a gas reserve, so a single wrap converts every
 * ETH deposit that landed before it. A deposit is therefore treated as finalized whenever any wrap follows it.
 * Consuming one wrap per deposit instead would leave the newest deposits permanently unmatched whenever one
 * wrap sweeps several of them, understating finalized transfers and overstating funds still in the bridge.
 * @dev Amounts are deliberately not compared: a wrap is usually worth slightly less than the deposits it sweeps
 * because gas is deducted, and callers already net deposited against finalized amounts. Since wrapping ETH is
 * only expected to be done by this relayer, this is a very accurate proxy for deciding when WETH cross chain
 * transfers have finalized into the relayer's L2 WETH inventory.
 * @dev This function is used in the WethBridge class in the OP stack and the ZkSyncAdapter.
 * @param l2EthDepositEvents List of L2 DepositFinalized events emitted when the EOA receives ETH on L2.
 * @param l2WrapEvents List of L2 Wrap events emitted when the EOA wraps ETH into WETH on L2.
 * @returns The subset of l2EthDepositEvents that a subsequent l2WrapEvent has wrapped into WETH inventory.
 */
export function matchL2EthDepositAndWrapEvents(l2EthDepositEvents: Log[], l2WrapEvents: Log[]): Log[] {
  const latestWrapBlock = l2WrapEvents.reduce((latest, { blockNumber }) => Math.max(latest, blockNumber), -1);
  return l2EthDepositEvents.filter(({ blockNumber }) => blockNumber <= latestWrapBlock);
}

// Note: All of these are set as `EvmAddress` types since their `toString()` implementation outputs a 20 byte address.
export function getAllowanceCacheKey(l1Token: EvmAddress, targetContract: EvmAddress, userAddress: EvmAddress): string {
  return `l1CanonicalTokenBridgeAllowance_${l1Token}_${userAddress}_targetContract:${targetContract}`;
}

export async function getTokenAllowanceFromCache(
  l1Token: EvmAddress,
  userAddress: EvmAddress,
  contractAddress: EvmAddress
): Promise<BigNumber | undefined> {
  const redis = await getRedisCache();
  const key = getAllowanceCacheKey(l1Token, contractAddress, userAddress);
  const allowance = await redis?.get<string>(key);
  if (!isDefined(allowance)) {
    return undefined;
  }
  return toBN(allowance);
}

export async function setTokenAllowanceInCache(
  l1Token: EvmAddress,
  userAddress: EvmAddress,
  contractAddress: EvmAddress,
  allowance: BigNumber
): Promise<void> {
  const redis = await getRedisCache();
  const key = getAllowanceCacheKey(l1Token, contractAddress, userAddress);
  await redis?.set(key, allowance.toString());
}

// Note: All of these are set as `EvmAddress` types since their `toString()` implementation outputs a 20 byte address.
function getL2AllowanceCacheKey(
  l2ChainId: number,
  l2Token: EvmAddress,
  userAddress: EvmAddress,
  contractAddress: EvmAddress
): string {
  return `l2BridgeTokenAllowance_${l2ChainId}_${l2Token}_${userAddress}_targetContract:${contractAddress}`;
}

export async function getL2TokenAllowanceFromCache(
  l2ChainId: number,
  l2Token: EvmAddress,
  userAddress: EvmAddress,
  contractAddress: EvmAddress
): Promise<BigNumber | undefined> {
  const redis = await getRedisCache();
  const key = getL2AllowanceCacheKey(l2ChainId, l2Token, userAddress, contractAddress);
  const allowance = await redis?.get<string>(key);
  if (!isDefined(allowance)) {
    return undefined;
  }
  return toBN(allowance);
}

export async function setL2TokenAllowanceInCache(
  l2ChainId: number,
  l2Token: EvmAddress,
  userAddress: EvmAddress,
  contractAddress: EvmAddress,
  allowance: BigNumber
): Promise<void> {
  const redis = await getRedisCache();
  const key = getL2AllowanceCacheKey(l2ChainId, l2Token, userAddress, contractAddress);
  await redis?.set(key, allowance.toString());
}
