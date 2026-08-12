import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectPromoMessage } from "./livePromo.js";

describe("selectPromoMessage", () => {
  it("round-robins tips across ticks", () => {
    const tips = ["roster", "intro"];
    assert.equal(selectPromoMessage(tips, 0), "roster");
    assert.equal(selectPromoMessage(tips, 1), "intro");
    assert.equal(selectPromoMessage(tips, 2), "roster");
    assert.equal(selectPromoMessage(tips, 3), "intro");
  });

  it("works with a single override tip", () => {
    assert.equal(selectPromoMessage(["only"], 0), "only");
    assert.equal(selectPromoMessage(["only"], 5), "only");
  });

  it("rejects an empty tip list", () => {
    assert.throws(() => selectPromoMessage([], 0), /at least one message/);
  });
});
