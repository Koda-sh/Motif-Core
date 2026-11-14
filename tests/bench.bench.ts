import { bench, describe } from "vitest";
import {
  Composite,
  compare,
  composite,
  createFingerprint,
  getBandHashes,
  getBandKeys,
  hash,
  mean,
  min,
  powerMean,
} from "../src/index.js";

const shortText = "The quick brown fox jumps over the lazy dog";
const mediumText = Array.from(
  { length: 20 },
  (_, i) =>
    `Distributed consensus protocols enable nodes ${i} in asynchronous networks to agree on state`,
).join(" ");
const largeText = Array.from(
  { length: 500 },
  (_, i) =>
    `Document section ${i} discussing distributed systems algorithms, hashing, and similarity search`,
).join(" ");

const fpA = createFingerprint(mediumText, { size: 128 });
const fpB = createFingerprint(largeText, { size: 128 });
const fps = Array.from({ length: 20 }, (_, i) =>
  createFingerprint(`Sample document ${i} with shared words and unique terms`, {
    size: 128,
  }),
);

describe("motif-core benchmarks", () => {
  describe("hashing", () => {
    bench("hash() short text (~9 words)", () => {
      hash(shortText);
    });

    bench("hash() medium text (~260 words)", () => {
      hash(mediumText);
    });

    bench("hash() large text (~6,000 words)", () => {
      hash(largeText);
    });
  });

  describe("comparison", () => {
    bench("fp.similarity(other)", () => {
      fpA.similarity(fpB);
    });

    bench("compare(a, b)", () => {
      compare(fpA, fpB);
    });
  });

  describe("LSH bands", () => {
    bench("getBandKeys() (16 bands, formatted hex)", () => {
      getBandKeys(fpA, { bands: 16 });
    });

    bench("getBandHashes() (16 bands, raw Uint32Array)", () => {
      getBandHashes(fpA, { bands: 16 });
    });
  });

  describe("compositing (20 fingerprints)", () => {
    const cubic = powerMean(3);

    bench("composite() with powerMean(3) fast-path", () => {
      composite(fps, { aggregator: cubic });
    });

    bench("composite() with mean", () => {
      composite(fps, { aggregator: mean });
    });

    bench("composite() with min", () => {
      composite(fps, { aggregator: min });
    });

    bench("Composite.add() + lazy .fingerprint", () => {
      const comp = new Composite();
      for (let i = 0; i < fps.length; i++) {
        comp.add(fps[i]!);
      }
      void comp.fingerprint;
    });
  });
});

