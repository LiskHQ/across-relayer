import {
  Contract,
  BigNumber,
  paginatedEventQuery,
  Signer,
  EventSearchConfig,
  Provider,
  toBN,
  toWei,
} from "../../utils";
import { CONTRACT_ADDRESSES, CUSTOM_ARBITRUM_GATEWAYS } from "../../common";
import { BridgeTransactionDetails, BaseBridgeAdapter, BridgeEvents } from "./BaseBridgeAdapter";
import { processEvent } from "../utils";

const DEFAULT_ERC20_GATEWAY = {
  l1: "0xa3A7B6F88361F48403514059F1F16C8E78d60EeC",
  l2: "0x09e9222E96E7B4AE2a407B98d48e330053351EEe",
};

export class ArbitrumOneBridge extends BaseBridgeAdapter {
  protected l1Gateway: Contract;

  private readonly transactionSubmissionData =
    "0x000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000";
  private readonly l2GasLimit = toBN(150000);
  private readonly l2GasPrice = toBN(20e9);
  private readonly l1SubmitValue = toWei(0.013);

  constructor(
    l2chainId: number,
    hubChainId: number,
    l1Signer: Signer,
    l2SignerOrProvider: Signer | Provider,
    l1Token: string
  ) {
    const { address: gatewayAddress, abi: l1Abi } = CONTRACT_ADDRESSES[hubChainId].arbitrumErc20GatewayRouter;
    const { l1: l1Address, l2: l2Address } = CUSTOM_ARBITRUM_GATEWAYS[l1Token] ?? DEFAULT_ERC20_GATEWAY;
    const l2Abi = CONTRACT_ADDRESSES[l2chainId].erc20Gateway.abi;

    super(l2chainId, hubChainId, l1Signer, l2SignerOrProvider, [l1Address]);

    this.l1Bridge = new Contract(l1Address, l1Abi, l1Signer);
    this.l2Bridge = new Contract(l2Address, l2Abi, l2SignerOrProvider);
    this.l1Gateway = new Contract(gatewayAddress, l1Abi, l1Signer);
  }

  async constructL1ToL2Txn(
    toAddress: string,
    l1Token: string,
    l2Token: string,
    amount: BigNumber
  ): Promise<BridgeTransactionDetails> {
    const { l1Gateway, l2GasLimit, l2GasPrice, transactionSubmissionData, l1SubmitValue } = this;
    return Promise.resolve({
      contract: l1Gateway,
      method: "outboundTransfer",
      args: [l1Token, toAddress, amount, l2GasLimit, l2GasPrice, transactionSubmissionData],
      value: l1SubmitValue,
    });
  }

  async queryL1BridgeInitiationEvents(
    l1Token: string,
    fromAddress: string,
    toAddress: string,
    eventConfig: EventSearchConfig
  ): Promise<BridgeEvents> {
    const events = await paginatedEventQuery(
      this.getL1Bridge(),
      this.getL1Bridge().filters.DepositInitiated(undefined, undefined, toAddress),
      eventConfig
    );
    return {
      [this.resolveL2TokenAddress(l1Token)]: events
        .filter(({ args }) => args.l1Token === l1Token)
        .map((event) => processEvent(event, "_amount", "_to", "_from")),
    };
  }

  async queryL2BridgeFinalizationEvents(
    l1Token: string,
    fromAddress: string,
    toAddress: string,
    eventConfig: EventSearchConfig
  ): Promise<BridgeEvents> {
    const events = await paginatedEventQuery(
      this.getL2Bridge(),
      this.getL2Bridge().filters.DepositFinalized(l1Token, undefined, toAddress),
      eventConfig
    );
    return {
      [this.resolveL2TokenAddress(l1Token)]: events.map((event) => processEvent(event, "amount", "to", "from")),
    };
  }
}
