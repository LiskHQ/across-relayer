import { expect } from "./utils";
import { matchL2EthDepositAndWrapEvents } from "../src/clients/bridges/utils";
import { Log } from "../src/interfaces";
import { ZERO_ADDRESS, ZERO_BYTES } from "../src/utils";

function makeLog(blockNumber: number): Log {
  return {
    blockNumber,
    blockHash: ZERO_BYTES,
    transactionIndex: 0,
    removed: false,
    address: ZERO_ADDRESS,
    data: "0x",
    topics: [],
    transactionHash: ZERO_BYTES,
    logIndex: 0,
    event: "",
    args: {},
  };
}

const blockNumbers = (events: Log[]): number[] => events.map(({ blockNumber }) => blockNumber);

describe("matchL2EthDepositAndWrapEvents", function () {
  it("finalizes nothing when the relayer has not wrapped", function () {
    expect(matchL2EthDepositAndWrapEvents([makeLog(10), makeLog(11)], [])).to.deep.equal([]);
  });

  it("finalizes deposits preceding a wrap and ignores those following it", function () {
    const matched = matchL2EthDepositAndWrapEvents([makeLog(10), makeLog(20), makeLog(31)], [makeLog(30)]);
    expect(blockNumbers(matched)).to.deep.equal([10, 20]);
  });

  it("finalizes every deposit swept by a single wrap", function () {
    // A rebalance may bridge in several legs; wrapping sweeps the whole balance, so one wrap covers them all.
    const matched = matchL2EthDepositAndWrapEvents([makeLog(10), makeLog(11)], [makeLog(12)]);
    expect(blockNumbers(matched)).to.deep.equal([10, 11]);
  });

  it("does not cascade a wrap shortfall onto later deposits", function () {
    // Two legs land at 10/11 and share the wrap at 12. Later deposits must still match their own wraps rather
    // than inheriting a permanent one-wrap deficit, which would report landed funds as stuck in the bridge.
    const deposits = [makeLog(10), makeLog(11), makeLog(20), makeLog(30)];
    const matched = matchL2EthDepositAndWrapEvents(deposits, [makeLog(12), makeLog(21), makeLog(31)]);
    expect(blockNumbers(matched)).to.deep.equal([10, 11, 20, 30]);
  });
});
