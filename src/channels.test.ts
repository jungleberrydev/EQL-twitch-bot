import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ChannelStore,
  ensureChannelsFile,
  loadChannels,
  normalizeLogin,
  saveChannels,
} from "./channels.js";

test("normalizeLogin strips # and lowercases", () => {
  assert.equal(normalizeLogin("#KestonTV"), "kestontv");
  assert.equal(normalizeLogin("  VarietyVoid "), "varietyvoid");
});

test("save/load channels round-trips and dedupes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-channels-"));
  const file = path.join(dir, "channels.json");
  saveChannels(file, ["KestonTV", "#varietyvoid", "kestontv", ""]);
  assert.deepEqual(loadChannels(file), ["kestontv", "varietyvoid"]);
});

test("ensureChannelsFile merges bootstrap into empty file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-channels-"));
  const file = path.join(dir, "channels.json");
  const { channels, wrote } = ensureChannelsFile(file, [
    "VarietyVoid",
    "jungleberrybush",
  ]);
  assert.equal(wrote, true);
  assert.deepEqual(channels, ["jungleberrybush", "varietyvoid"]);
});

test("ChannelStore add/remove persists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-channels-"));
  const file = path.join(dir, "channels.json");
  const store = new ChannelStore(file, ["varietyvoid"]);
  assert.equal(store.add("KestonTV"), true);
  assert.equal(store.add("kestontv"), false);
  assert.equal(store.remove("varietyvoid"), true);
  assert.deepEqual(loadChannels(file), ["kestontv"]);
});
