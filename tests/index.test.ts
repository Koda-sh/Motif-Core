import { describe, expect, it } from "vitest";
import {
  HASH_VERSION,
  VERSION,
  create,
  createFingerprint,
  createTokens,
  createUnigrams,
  createVarigrams,
  hash,
  minHash,
  textFilter,
  textStrip,
  tokenize,
  unigramsFromTokens,
  varigramsFromTokens,
} from "../src/index.js";

describe("motif-core", () => {
  it("exports VERSION and HASH_VERSION", () => {
    expect(VERSION).toBe("0.1.0");
    expect(HASH_VERSION).toBe(1);
  });

  describe("textFilter and textStrip", () => {
    it("filters and strips text", () => {
      expect(textFilter("Hello, World!🚀")).toBe("hello, world!");
      expect(textStrip("Hello, World! 🚀")).toBe("helloworld");
    });

    it("throws TypeError on non-string input", () => {
      expect(() => textFilter(null as unknown as string)).toThrow(TypeError);
      expect(() => textStrip(123 as unknown as string)).toThrow(TypeError);
    });
  });

  describe("tokenizer", () => {
    it("tokenizes text into tokens, unigrams, and varigrams", () => {
      const result = tokenize("The quick, brown fox!", { varigramSize: 2 });
      expect(result.tokens).toEqual(["the", "quick,", "brown", "fox!"]);
      expect(result.unigrams).toEqual(["the", "quick", "brown", "fox"]);
      expect(result.varigrams).toEqual(["thequick", "quickbrown", "brownfox"]);
    });

    it("handles empty or whitespace-only text gracefully", () => {
      expect(createTokens("")).toEqual([]);
      expect(createTokens("   \t\n  ")).toEqual([]);
      expect(createUnigrams("")).toEqual([]);
      expect(createVarigrams("", 2)).toEqual([]);

      const emptyResult = tokenize("   ");
      expect(emptyResult.tokens).toEqual([]);
      expect(emptyResult.unigrams).toEqual([]);
      expect(emptyResult.varigrams).toEqual([]);
    });

    it("supports standalone token helpers", () => {
      expect(createTokens("Hello World!")).toEqual(["hello", "world!"]);
      expect(createUnigrams("Hello World!")).toEqual(["hello", "world"]);
      expect(createVarigrams("One Two Three", 2)).toEqual(["onetwo", "twothree"]);
    });

    it("returns empty varigrams when token count < varigramSize", () => {
      expect(varigramsFromTokens(["hello", "world"], 4)).toEqual([]);
    });

    it("supports unnormalized tokenization and varigrams", () => {
      const tokens = createTokens("Hello, WORLD!", false);
      expect(tokens).toEqual(["Hello,", "WORLD!"]);
      expect(unigramsFromTokens(tokens, false)).toEqual(["Hello,", "WORLD!"]);
      expect(varigramsFromTokens(tokens, 2, false)).toEqual(["Hello, WORLD!"]);
    });

    it("validates varigramSize", () => {
      expect(() => createVarigrams("test", 0)).toThrow(RangeError);
      expect(() => createVarigrams("test", -1)).toThrow(RangeError);
      expect(() => createVarigrams("test", 1.5)).toThrow(RangeError);
      expect(() => createVarigrams("test", Number.NaN)).toThrow(RangeError);
      expect(() => tokenize("test", { varigramSize: 0 })).toThrow(RangeError);
      expect(() => varigramsFromTokens(["a"], 0)).toThrow(RangeError);
    });

    it("throws TypeError on non-string input to token helpers", () => {
      expect(() => createTokens(null as unknown as string)).toThrow(TypeError);
      expect(() => tokenize(undefined as unknown as string)).toThrow(TypeError);
    });
  });

  describe("hash and minHash", () => {
    it("hashes text into a FingerprintRecord with deterministic MinHash fingerprint", () => {
      const recordA = hash("The quick brown fox jumps over the lazy dog");
      const recordB = create("The quick brown fox jumps over the lazy dog");

      expect(recordA.version).toBe(1);
      expect(recordA.fingerprint).toBeInstanceOf(Uint32Array);
      expect(recordA.fingerprint.length).toBe(128);
      expect(Array.from(recordA.fingerprint)).toEqual(
        Array.from(recordB.fingerprint),
      );
      expect(typeof recordA.createdAt).toBe("number");
    });

    it("createFingerprint returns raw Fingerprint matching hash().fingerprint", () => {
      const raw = createFingerprint("test text");
      const record = hash("test text");
      expect(Array.from(raw)).toEqual(Array.from(record.fingerprint));
    });

    it("produces identical fingerprints regardless of duplicate features (set MinHash idempotency)", () => {
      const fpSingle = minHash(["apple", "banana", "cherry"], 64);
      const fpDuplicates = minHash(
        ["apple", "apple", "banana", "cherry", "banana", "apple"],
        64,
      );
      expect(Array.from(fpSingle)).toEqual(Array.from(fpDuplicates));
    });

    it("returns all 0xffffffff for empty feature items", () => {
      const emptyFp = minHash([], 32);
      expect(emptyFp.length).toBe(32);
      expect(emptyFp.every((val) => val === 0xffffffff)).toBe(true);

      const emptyRecord = hash("");
      expect(emptyRecord.fingerprint.every((val) => val === 0xffffffff)).toBe(
        true,
      );
    });

    it("validates size and varigramSize options strictly", () => {
      expect(() => hash("test", { size: 0 })).toThrow(RangeError);
      expect(() => hash("test", { size: -1 })).toThrow(RangeError);
      expect(() => hash("test", { size: 1.5 })).toThrow(RangeError);
      expect(() => hash("test", { size: Number.NaN })).toThrow(RangeError);
      expect(() => hash("test", { varigramSize: 0 })).toThrow(RangeError);
      expect(() => hash("test", { varigramSize: -2 })).toThrow(RangeError);
      expect(() => hash("test", { varigramSize: 2.2 })).toThrow(RangeError);
      expect(() => hash("test", { varigramSize: Number.NaN })).toThrow(
        RangeError,
      );
      expect(() => createFingerprint("test", 0)).toThrow(RangeError);
      expect(() => minHash([], 0)).toThrow(RangeError);
      expect(() => minHash([], 1.5)).toThrow(RangeError);
    });

    it("throws TypeError on non-string input to hash", () => {
      expect(() => hash(null as unknown as string)).toThrow(TypeError);
      expect(() => createFingerprint(undefined as unknown as string)).toThrow(
        TypeError,
      );
    });
  });
});
