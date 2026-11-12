import { describe, expect, it } from "vitest";
import {
  DEFAULT_STOP_WORDS,
  Fingerprint,
  HASH_VERSION,
  VERSION,
  compare,
  containment,
  create,
  createFingerprint,
  createShingles,
  createTokens,
  createUnigrams,
  createVarigrams,
  distance,
  hash,
  minHash,
  similarity,
  streamFeatures,
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
      expect(result.shingles).toEqual([]);
    });

    it("handles empty or whitespace-only text gracefully", () => {
      expect(createTokens("")).toEqual([]);
      expect(createTokens("   \t\n  ")).toEqual([]);
      expect(createUnigrams("")).toEqual([]);
      expect(createVarigrams("", 2)).toEqual([]);
      expect(createShingles("", 3)).toEqual([]);

      const emptyResult = tokenize("   ");
      expect(emptyResult.tokens).toEqual([]);
      expect(emptyResult.unigrams).toEqual([]);
      expect(emptyResult.varigrams).toEqual([]);
      expect(emptyResult.shingles).toEqual([]);
    });

    it("supports standalone token helpers", () => {
      expect(createTokens("Hello World!")).toEqual(["hello", "world!"]);
      expect(createUnigrams("Hello World!")).toEqual(["hello", "world"]);
      expect(createVarigrams("One Two Three", 2)).toEqual(["onetwo", "twothree"]);
    });

    it("supports character shingling", () => {
      const shingles = createShingles("hello", 3);
      expect(shingles).toEqual(["hel", "ell", "llo"]);
      expect(createShingles("hi", 3)).toEqual([]);

      const tokenized = tokenize("hello world", { shingleSize: 3 });
      expect(tokenized.shingles.length).toBeGreaterThan(0);
      expect(tokenized.shingles).toContain("hel");
    });

    it("supports stop word filtering", () => {
      const withStop = createTokens("this is a test of the system", true, false);
      expect(withStop).toContain("this");
      expect(withStop).toContain("is");
      expect(withStop).toContain("the");

      const withoutStop = createTokens("this is a test of the system", true, true);
      expect(withoutStop).not.toContain("this");
      expect(withoutStop).not.toContain("is");
      expect(withoutStop).not.toContain("the");
      expect(withoutStop).toEqual(["test", "system"]);

      const customStop = createTokens("red green blue", true, ["green"]);
      expect(customStop).toEqual(["red", "blue"]);
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

    it("validates varigramSize and shingleSize", () => {
      expect(() => createVarigrams("test", 0)).toThrow(RangeError);
      expect(() => createVarigrams("test", -1)).toThrow(RangeError);
      expect(() => createVarigrams("test", 1.5)).toThrow(RangeError);
      expect(() => createVarigrams("test", Number.NaN)).toThrow(RangeError);
      expect(() => createShingles("test", 0)).toThrow(RangeError);
      expect(() => createShingles("test", -2)).toThrow(RangeError);
      expect(() => tokenize("test", { varigramSize: 0 })).toThrow(RangeError);
      expect(() => tokenize("test", { shingleSize: 0 })).toThrow(RangeError);
      expect(() => varigramsFromTokens(["a"], 0)).toThrow(RangeError);
    });

    it("throws TypeError on non-string input to token helpers", () => {
      expect(() => createTokens(null as unknown as string)).toThrow(TypeError);
      expect(() => tokenize(undefined as unknown as string)).toThrow(TypeError);
      expect(() => createShingles(123 as unknown as string)).toThrow(TypeError);
    });
  });

  describe("hash and minHash", () => {
    it("hashes text into a FingerprintRecord with deterministic MinHash fingerprint", () => {
      const recordA = hash("The quick brown fox jumps over the lazy dog");
      const recordB = create("The quick brown fox jumps over the lazy dog");

      expect(recordA.version).toBe(1);
      expect(recordA.fingerprint).toBeInstanceOf(Uint32Array);
      expect(recordA.fingerprint).toBeInstanceOf(Fingerprint);
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

    it("createFingerprint accepts either options object or positional parameters", () => {
      const fpObj = createFingerprint("sample text", { size: 64, varigramSize: 2 });
      const fpPos = createFingerprint("sample text", 64, 2);
      expect(Array.from(fpObj)).toEqual(Array.from(fpPos));
    });

    it("streams features without full array concatenations", () => {
      const features = Array.from(streamFeatures("one two three", { varigramSize: 2 }));
      expect(features.length).toBeGreaterThan(0);
      expect(features).toContain("one");
      expect(features).toContain("onetwo");
    });

    it("generic minHash accepts arbitrary string or number iterables", () => {
      // Iterable of strings
      const fpFromSet = minHash(new Set(["alpha", "beta", "gamma"]), 32);
      expect(fpFromSet.length).toBe(32);

      // Iterable of pre-hashed numbers
      const hashes = [12345, 67890, 42];
      const fpFromNumbers = minHash(hashes, 32);
      expect(fpFromNumbers.length).toBe(32);
    });

    it("character shingles make fingerprints typo-resilient", () => {
      const text1 = "internationalization and accessibility across distributed computing systems";
      const text2 = "internationlization and accessability across distributed computng systems";

      // Without shingles (words only, strict match)
      const fpWord1 = createFingerprint(text1, { size: 128 });
      const fpWord2 = createFingerprint(text2, { size: 128 });

      // With character shingles (3-grams)
      const fpShingle1 = createFingerprint(text1, { size: 128, shingleSize: 3 });
      const fpShingle2 = createFingerprint(text2, { size: 128, shingleSize: 3 });

      // Shingled fingerprint should maintain significantly higher similarity despite typos
      expect(fpShingle1.similarity(fpShingle2)).toBeGreaterThan(
        fpWord1.similarity(fpWord2),
      );
      expect(fpShingle1.similarity(fpShingle2)).toBeGreaterThan(0.6);
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

  describe("Fingerprint and comparison methods", () => {
    it("compares two identical fingerprints with 1.0 similarity", () => {
      const fp = createFingerprint("the quick brown fox");
      const res = fp.compare(fp);

      expect(res.similarity).toBe(1);
      expect(res.distance).toBe(0);
      expect(res.matches).toBe(fp.length);
      expect(res.size).toBe(fp.length);
      expect(fp.similarity(fp)).toBe(1);
      expect(fp.distance(fp)).toBe(0);
      expect(fp.matches(fp)).toBe(fp.length);
    });

    it("compares completely different fingerprints with near 0 similarity", () => {
      const fp1 = createFingerprint("apple banana orange strawberry pineapple");
      const fp2 = createFingerprint("galaxy telescope astronaut astrophysics nebula orbit");

      const sim = similarity(fp1, fp2);
      expect(sim).toBeLessThan(0.1);
      expect(distance(fp1, fp2)).toBeGreaterThan(fp1.length * 0.9);
    });

    it("calculates containment correctly using inverted Jaccard", () => {
      const excerpt = "the quick brown fox jumps over the lazy dog";
      const fullDoc = "in the forest the quick brown fox jumps over the lazy dog while birds fly in the sky and squirrels hide";

      const fpExcerpt = createFingerprint(excerpt, { size: 256 });
      const fpFull = createFingerprint(fullDoc, { size: 256 });

      const excerptFeatures = Array.from(streamFeatures(excerpt)).length;
      const fullDocFeatures = Array.from(streamFeatures(fullDoc)).length;

      const c = containment(fpExcerpt, fpFull, excerptFeatures, fullDocFeatures);
      // Excerpt is fully contained in fullDoc, so estimated containment should be high (~0.8 to 1.0)
      expect(c).toBeGreaterThan(0.7);
    });

    it("throws RangeError on fingerprint size mismatch during comparison", () => {
      const fp1 = createFingerprint("text", { size: 64 });
      const fp2 = createFingerprint("text", { size: 128 });

      expect(() => compare(fp1, fp2)).toThrow(RangeError);
      expect(() => similarity(fp1, fp2)).toThrow(RangeError);
      expect(() => distance(fp1, fp2)).toThrow(RangeError);
      expect(() => fp1.compare(fp2)).toThrow(RangeError);
    });
  });
});
