import { describe, expect, it } from "vitest";
import {
  Composite,
  composite,
  createFingerprint,
  defaultAggregator,
  max,
  mean,
  mid,
  min,
  normalizeSlot,
  powerMean,
  sum,
  type SlotAggregator,
} from "../src/index.js";

describe("composite fingerprints", () => {
  describe("aggregators", () => {
    it("normalizeSlot clamps to [0, 0xffffffff]", () => {
      expect(normalizeSlot(-5)).toBe(0);
      expect(normalizeSlot(0)).toBe(0);
      expect(normalizeSlot(Number.NaN)).toBe(0);
      expect(normalizeSlot(Number.POSITIVE_INFINITY)).toBe(0);
      expect(normalizeSlot(100.4)).toBe(100);
      expect(normalizeSlot(100.6)).toBe(101);
      expect(normalizeSlot(0xffffffff + 1000)).toBe(0xffffffff);
    });

    it("min and max find extreme values without stack overflow", () => {
      const vals = [10, 50, 5, 20];
      const ctx = { slot: 0, size: 128 };
      expect(min(vals, ctx)).toBe(5);
      expect(max(vals, ctx)).toBe(50);
      expect(min([], ctx)).toBe(0);
      expect(max([], ctx)).toBe(0);
    });

    it("mean calculates arithmetic mean with optional weights", () => {
      const vals = [10, 20, 30];
      expect(mean(vals, { slot: 0, size: 128 })).toBe(20);

      // Weighted mean: 10*1 + 20*1 + 30*2 = 90 / 4 = 22.5
      expect(
        mean(vals, { slot: 0, size: 128, weights: [1, 1, 2] }),
      ).toBe(22.5);
    });

    it("mid calculates midpoint of min and max", () => {
      expect(mid([10, 50, 5, 20], { slot: 0, size: 128 })).toBe(27.5);
    });

    it("sum adds values with optional weights", () => {
      expect(sum([10, 20, 30], { slot: 0, size: 128 })).toBe(60);
      expect(sum([10, 20], { slot: 0, size: 128, weights: [2, 3] })).toBe(80);
    });

    it("powerMean feature boosts dominant signals", () => {
      const cubic = powerMean(3);
      const vals = [100, 200, 300];
      const res = cubic(vals, { slot: 0, size: 128 });
      // Cubic mean is strictly greater than arithmetic mean (200) due to convex feature boosting
      expect(res).toBeGreaterThan(200);

      // Geometric mean (exponent = 0)
      const geom = powerMean(0);
      const gRes = geom([10, 100], { slot: 0, size: 128 });
      expect(gRes).toBeCloseTo(31.62, 1);
    });
  });

  describe("functional composite()", () => {
    it("returns an empty zeroed fingerprint for empty input", () => {
      const comp = composite([], { emptySize: 64 });
      expect(comp.length).toBe(64);
      expect(comp.every((v) => v === 0)).toBe(true);
    });

    it("combines multiple text strings into a valid Fingerprint", () => {
      const doc1 = "quantum computing algorithms qubits superposition";
      const doc2 = "quantum decoherence error correction qubits";
      const doc3 = "quantum teleportation entanglement qubits";

      const comp = composite([doc1, doc2, doc3], {
        create: { size: 128 },
        aggregator: defaultAggregator,
      });

      expect(comp.length).toBe(128);
      const fp1 = createFingerprint(doc1, { size: 128 });
      const fp2 = createFingerprint(doc2, { size: 128 });

      // The composite preserves shared features across members
      expect(comp.similarity(fp1)).toBeGreaterThan(0.1);
      expect(comp.similarity(fp2)).toBeGreaterThan(0.1);
    });

    it("min aggregator forms the exact MinHash set union", () => {
      const fp1 = createFingerprint("hello world alpha", { size: 64 });
      const fp2 = createFingerprint("hello world beta", { size: 64 });

      const compMin = composite([fp1, fp2], { aggregator: min });
      expect(compMin.length).toBe(64);
      expect(compMin.similarity(fp1)).toBeGreaterThan(0.4);
    });

    it("accepts pre-existing Fingerprint instances", () => {
      const fp1 = createFingerprint("hello world alpha", { size: 64 });
      const fp2 = createFingerprint("hello world beta", { size: 64 });

      const comp = composite([fp1, fp2]);
      expect(comp.length).toBe(64);
      expect(comp.similarity(fp1)).toBeGreaterThan(0.4);
    });

    it("passes weights to the aggregator context", () => {
      const fp1 = createFingerprint("apples and oranges", { size: 64 });
      const fp2 = createFingerprint("oranges and bananas", { size: 64 });

      let receivedWeights: readonly number[] | undefined;
      const inspector: SlotAggregator = (vals, ctx) => {
        receivedWeights = ctx.weights;
        return vals[0]!;
      };

      composite([[fp1, 10], [fp2, 1]], { aggregator: inspector });
      expect(receivedWeights).toEqual([10, 1]);
    });

    it("throws RangeError on invalid weights in functional composite()", () => {
      const fp1 = createFingerprint("apples", { size: 64 });
      expect(() => composite([[fp1, 0]])).toThrow(RangeError);
      expect(() => composite([[fp1, -1]])).toThrow(RangeError);
      expect(() => composite([[fp1, Number.NaN]])).toThrow(RangeError);
    });

    it("throws RangeError on fingerprint size mismatch", () => {
      const fp64 = createFingerprint("short", { size: 64 });
      const fp128 = createFingerprint("long", { size: 128 });

      expect(() => composite([fp64, fp128])).toThrow(RangeError);
    });
  });

  describe("stateful Composite class", () => {
    it("supports adding, setting, deleting, and clearing entries", () => {
      const comp = new Composite({ create: { size: 64 } });
      expect(comp.size).toBe(0);

      comp.add("first document");
      comp.set("doc2", "second document", 2);

      expect(comp.size).toBe(2);
      expect(comp.has("doc2")).toBe(true);
      expect(comp.get("doc2")?.weight).toBe(2);

      expect(comp.delete("doc2")).toBe(true);
      expect(comp.size).toBe(1);

      comp.clear();
      expect(comp.size).toBe(0);
    });

    it("evaluates lazily and caches the aggregated fingerprint", () => {
      const comp = new Composite({ create: { size: 64 } });

      // Adding items does not build until .fingerprint is read
      for (let i = 0; i < 50; i++) {
        comp.add(`document number ${i} with extra text`);
      }
      expect(comp.size).toBe(50);

      // First read: computes and caches
      const fpA = comp.fingerprint;
      expect(fpA.length).toBe(64);

      // Second read: instant cache hit (same object reference)
      const fpB = comp.fingerprint;
      expect(fpA).toBe(fpB);

      // Mutating invalidates cache
      comp.add("another document");
      const fpC = comp.fingerprint;
      expect(fpC).not.toBe(fpA);
    });

    it("supports addMany with arrays and records", () => {
      const comp = new Composite({ create: { size: 64 } });

      comp.addMany(["doc A", "doc B"]);
      expect(comp.size).toBe(2);

      comp.addMany({ key1: "doc C", key2: "doc D" });
      expect(comp.size).toBe(4);
      expect(comp.has("key1")).toBe(true);
    });

    it("provides direct similarity() and compare() methods", () => {
      const comp = new Composite({ create: { size: 64 } });
      const text = "machine learning neural networks deep learning";
      comp.add(text);

      const probe = createFingerprint(text, { size: 64 });
      expect(comp.similarity(probe)).toBe(1);

      const res = comp.compare(probe);
      expect(res.similarity).toBe(1);
      expect(res.distance).toBe(0);
      expect(res.matches).toBe(64);
    });

    it("rejects invalid keys and weights", () => {
      const comp = new Composite();
      expect(() => comp.set("", "text")).toThrow(TypeError);
      expect(() => comp.set("key", "text", 0)).toThrow(RangeError);
      expect(() => comp.set("key", "text", -2)).toThrow(RangeError);
      expect(() => comp.set("key", null as any)).toThrow(TypeError);
    });

    it("throws on size mismatch when adding new entries", () => {
      const comp = new Composite();
      const fp64 = createFingerprint("doc", { size: 64 });
      const fp128 = createFingerprint("doc", { size: 128 });

      comp.add(fp64);
      expect(() => comp.add(fp128)).toThrow(RangeError);
    });
  });
});
