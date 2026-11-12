import type {
  Fingerprint,
  FingerprintRecord,
  HashOptions,
  Token,
  Unigram,
  Varigram,
} from "../types.js";
import {
  createTokens,
  unigramsFromTokens,
  varigramsFromTokens,
} from "./tokenizer.js";

export const HASH_VERSION = 1;

export const defaultHashOptions = {
  size: 128,
  varigramSize: 4,
  normalize: true,
} as const;

function assertValidSize(size: number): void {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size must be an integer >= 1, received ${size}`);
  }
}

function assertValidVarigramSize(varigramSize: number): void {
  if (!Number.isInteger(varigramSize) || varigramSize < 1) {
    throw new RangeError(
      `varigramSize must be an integer >= 1, received ${varigramSize}`,
    );
  }
}

function assertValidString(value: unknown, paramName = "text"): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(
      `Expected ${paramName} to be a string, received ${typeof value}`,
    );
  }
}

/**
 * Generate a FingerprintRecord (versioned MinHash fingerprint with creation timestamp) from text.
 */
export function hash(
  text: string,
  options: HashOptions = {},
): FingerprintRecord {
  assertValidString(text, "text");

  const size = options.size ?? defaultHashOptions.size;
  const varigramSize = options.varigramSize ?? defaultHashOptions.varigramSize;
  const normalize = options.normalize ?? defaultHashOptions.normalize;

  assertValidSize(size);
  assertValidVarigramSize(varigramSize);

  const fingerprint = createFingerprint(text, size, varigramSize, normalize);

  return {
    version: HASH_VERSION,
    fingerprint,
    createdAt: Date.now(),
  };
}

/**
 * Alias for `hash` to create a FingerprintRecord from text.
 */
export const create = hash;

/**
 * Compute the raw `Fingerprint` (`Uint32Array`) MinHash signature directly from text.
 */
export function createFingerprint(
  text: string,
  size: number = defaultHashOptions.size,
  varigramSize: number = defaultHashOptions.varigramSize,
  normalize: boolean = defaultHashOptions.normalize,
): Fingerprint {
  assertValidString(text, "text");
  assertValidSize(size);
  assertValidVarigramSize(varigramSize);

  const tokens = createTokens(text, normalize);
  const unigrams = unigramsFromTokens(tokens, normalize);
  const varigrams = varigramsFromTokens(tokens, varigramSize, normalize);

  return minHash([...tokens, ...unigrams, ...varigrams], size);
}

/**
 * Brand a `Uint32Array` as a `Fingerprint`.
 */
export function asFingerprint(value: Uint32Array): Fingerprint {
  return value as Fingerprint;
}

/**
 * 32-bit FNV-1a hash of a string.
 */
export function hashValue(value: string): number {
  let h = 2166136261;

  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

/**
 * MurmurHash3-style 32-bit finalizer mix of a seed hash and permutation index.
 */
export function mix(seed: number, index: number): number {
  let x = seed ^ Math.imul(index + 1, 0x9e3779b9);

  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);

  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);

  x ^= x >>> 16;

  return x >>> 0;
}

/**
 * Compute a set MinHash `Fingerprint` of length `size` over a collection of token features.
 * Automatically deduplicates item seeds to avoid redundant mix cycles.
 */
export function minHash(
  items: readonly (Token | Unigram | Varigram)[],
  size: number,
): Fingerprint {
  assertValidSize(size);

  const fingerprint = new Uint32Array(size);
  fingerprint.fill(0xffffffff);

  if (items.length === 0) {
    return asFingerprint(fingerprint);
  }

  // Deduplicate seeds: Set MinHash is idempotent, so duplicate seeds produce
  // identical mixes that can never reduce an already-recorded minimum.
  const seenSeeds = new Set<number>();

  for (let j = 0; j < items.length; j++) {
    const item = items[j]!;
    const seed = hashValue(item);

    if (seenSeeds.has(seed)) {
      continue;
    }
    seenSeeds.add(seed);

    for (let i = 0; i < size; i++) {
      const mixed = mix(seed, i);

      if (mixed < fingerprint[i]!) {
        fingerprint[i] = mixed;
      }
    }
  }

  return asFingerprint(fingerprint);
}
