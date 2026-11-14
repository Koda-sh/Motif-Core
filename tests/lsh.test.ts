import { describe, expect, it } from "vitest";
import {
  countBandCollisions,
  createFingerprint,
  formatBandKey,
  getBandHashes,
  getBandKeys,
  hasBandCollision,
  hashBandSlice,
  optimalBands,
  resolveBands,
} from "../src/index.js";

describe("LSH bands", () => {
  describe("resolveBands", () => {
    it("resolves default configuration for size 128", () => {
      const resolved = resolveBands(128);
      expect(resolved.bands).toBe(16);
      expect(resolved.rows).toBe(8);
      expect(resolved.totalSlots).toBe(128);
      expect(resolved.threshold).toBeCloseTo(0.707, 2);
    });

    it("resolves when only bands is specified", () => {
      const resolved = resolveBands(128, { bands: 32 });
      expect(resolved.bands).toBe(32);
      expect(resolved.rows).toBe(4);
      expect(resolved.totalSlots).toBe(128);
    });

    it("resolves when only rows is specified", () => {
      const resolved = resolveBands(128, { rows: 16 });
      expect(resolved.bands).toBe(8);
      expect(resolved.rows).toBe(16);
      expect(resolved.totalSlots).toBe(128);
    });

    it("validates inputs and throws RangeError on invalid configurations", () => {
      expect(() => resolveBands(0)).toThrow(RangeError);
      expect(() => resolveBands(128, { bands: 0 })).toThrow(RangeError);
      expect(() => resolveBands(128, { rows: 0 })).toThrow(RangeError);
      expect(() => resolveBands(128, { bands: 200 })).toThrow(RangeError);
      expect(() => resolveBands(128, { bands: 16, rows: 10 })).toThrow(
        RangeError,
      );
    });
  });

  describe("hashBandSlice and formatBandKey", () => {
    it("hashes a slice deterministically", () => {
      const data = new Uint32Array([100, 200, 300, 400]);
      const h1 = hashBandSlice(data, 0, 4);
      const h2 = hashBandSlice(data, 0, 4);
      expect(h1).toBe(h2);
      expect(typeof h1).toBe("number");
      expect(h1).toBeGreaterThanOrEqual(0);
    });

    it("formats band key with band index and 8-char padded hex", () => {
      expect(formatBandKey(0, 0x1234abcd)).toBe("0:1234abcd");
      expect(formatBandKey(5, 0x5)).toBe("5:00000005");
    });
  });

  describe("getBandKeys and Fingerprint.bandKeys()", () => {
    it("generates correct number of band keys", () => {
      const fp = createFingerprint("the quick brown fox jumps over the lazy dog", {
        size: 128,
      });

      const keysDefault = getBandKeys(fp);
      expect(keysDefault.length).toBe(16);
      expect(keysDefault[0]).toMatch(/^0:[0-9a-f]{8}$/);
      expect(keysDefault[15]).toMatch(/^15:[0-9a-f]{8}$/);

      // Method on Fingerprint instance
      const fpKeys = fp.bandKeys({ bands: 32 });
      expect(fpKeys.length).toBe(32);
      expect(fpKeys[31]).toMatch(/^31:[0-9a-f]{8}$/);

      // Numeric band hashes
      const hashes = getBandHashes(fp, { bands: 16 });
      expect(hashes).toBeInstanceOf(Uint32Array);
      expect(hashes.length).toBe(16);
      expect(fp.bandHashes({ bands: 16 })).toEqual(hashes);
    });

    it("identical fingerprints produce identical band keys", () => {
      const text = "consistent deterministic text hashing";
      const fp1 = createFingerprint(text, { size: 128 });
      const fp2 = createFingerprint(text, { size: 128 });

      expect(fp1.bandKeys()).toEqual(fp2.bandKeys());
    });

    it("similar fingerprints share colliding band keys", () => {
      const base =
        "The quick brown fox jumps over the lazy dog and runs through the forest with great speed and agility";
      const slightVariation =
        "The quick brown fox jumps over the lazy dog and walks through the forest with great speed and agility";

      const fpA = createFingerprint(base, { size: 128 });
      const fpB = createFingerprint(slightVariation, { size: 128 });

      // With bands: 32 (rows = 4, threshold ~0.42), near-identical text reliably collides
      const keysA = fpA.bandKeys({ bands: 32 });
      const keysB = fpB.bandKeys({ bands: 32 });

      expect(hasBandCollision(keysA, keysB)).toBe(true);
      const collisions = countBandCollisions(keysA, keysB);
      expect(collisions).toBeGreaterThan(0);
    });

    it("completely different fingerprints have no band collisions", () => {
      const fp1 = createFingerprint("galaxy astrophysics space telescope nebula orbit", {
        size: 128,
      });
      const fp2 = createFingerprint("organic chemistry polymer molecular reaction enzyme", {
        size: 128,
      });

      const keys1 = fp1.bandKeys({ bands: 16 });
      const keys2 = fp2.bandKeys({ bands: 16 });

      expect(hasBandCollision(keys1, keys2)).toBe(false);
      expect(countBandCollisions(keys1, keys2)).toBe(0);
    });
  });

  describe("optimalBands", () => {
    it("finds closest configuration for target similarity", () => {
      const opt70 = optimalBands(0.7, 128);
      expect(opt70.threshold).toBeCloseTo(0.7, 1);

      const opt50 = optimalBands(0.5, 128);
      expect(opt50.threshold).toBeCloseTo(0.5, 1);

      expect(() => optimalBands(0, 128)).toThrow(RangeError);
      expect(() => optimalBands(1, 128)).toThrow(RangeError);
    });
  });
});

