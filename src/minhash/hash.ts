import { Fingerprint } from "../fingerprint/fingerprint.js";
import type {
  FingerprintRecord,
  HashOptions,
} from "../types.js";
import {
  filterText,
  resolveStopWords,
  stripText,
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

function assertValidShingleSize(shingleSize: number): void {
  if (!Number.isInteger(shingleSize) || shingleSize < 1) {
    throw new RangeError(
      `shingleSize must be an integer >= 1, received ${shingleSize}`,
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

// Generate an on-the-fly feature stream (tokens, unigrams, varigrams, shingles) from text
// using a single-pass scanner and sliding window with O(1) auxiliary memory.
export function* streamFeatures(
  text: string,
  options: HashOptions = {},
): Generator<string> {
  assertValidString(text, "text");

  const normalize = options.normalize ?? defaultHashOptions.normalize;
  const varigramSize = options.varigramSize ?? defaultHashOptions.varigramSize;
  assertValidVarigramSize(varigramSize);

  if (options.shingleSize !== undefined) {
    assertValidShingleSize(options.shingleSize);
  }

  const stopWordsSet = resolveStopWords(options.stopWords);
  const window: string[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(text)) !== null) {
    let token = match[0];
    if (normalize) {
      token = filterText(token);
      if (token.length === 0) {
        continue;
      }
    }

    if (stopWordsSet) {
      const strippedForStop = stripText(token);
      if (stopWordsSet.has(strippedForStop)) {
        continue;
      }
    }

    // Yield filtered word token
    yield token;

    // Yield stripped unigram
    if (normalize) {
      const unigram = stripText(token);
      if (unigram.length > 0) {
        yield unigram;
      }
    }

    // Maintain sliding window for varigrams
    window.push(token);
    if (window.length === varigramSize) {
      const joined = window.join(" ");
      if (normalize) {
        const varigram = stripText(joined);
        if (varigram.length > 0) {
          yield varigram;
        }
      } else {
        yield joined;
      }
      window.shift();
    }
  }

  // Yield optional character shingles
  if (options.shingleSize !== undefined) {
    const shingleSize = options.shingleSize;
    const cleaned = normalize ? stripText(text) : text;
    const count = cleaned.length - shingleSize + 1;
    for (let i = 0; i < count; i++) {
      yield cleaned.slice(i, i + shingleSize);
    }
  }
}

// Count the number of unique feature seeds extracted from text.
export function countFeatures(
  text: string,
  options: HashOptions = {},
): number {
  const seen = new Set<number>();
  for (const feature of streamFeatures(text, options)) {
    seen.add(hashValue(feature));
  }
  return seen.size;
}

// Generate a FingerprintRecord (versioned MinHash fingerprint with featureCount and timestamp) from text.
export function hash(
  text: string,
  options: HashOptions = {},
): FingerprintRecord {
  assertValidString(text, "text");

  const size = options.size ?? defaultHashOptions.size;
  const varigramSize = options.varigramSize ?? defaultHashOptions.varigramSize;

  assertValidSize(size);
  assertValidVarigramSize(varigramSize);

  const { fingerprint, featureCount } = minHashWithCount(
    streamFeatures(text, options),
    size,
  );

  return {
    version: HASH_VERSION,
    fingerprint,
    featureCount,
    createdAt: Date.now(),
  };
}

// Compute the raw `Fingerprint` MinHash signature directly from text.
// Supports either a HashOptions object or positional parameters.
export function createFingerprint(
  text: string,
  optionsOrSize?: HashOptions | number,
  varigramSize?: number,
  normalize?: boolean,
): Fingerprint {
  assertValidString(text, "text");

  let options: HashOptions;
  if (typeof optionsOrSize === "number") {
    options = {
      size: optionsOrSize,
      varigramSize: varigramSize ?? defaultHashOptions.varigramSize,
      normalize: normalize ?? defaultHashOptions.normalize,
    };
  } else {
    options = optionsOrSize ?? {};
  }

  const size = options.size ?? defaultHashOptions.size;
  const vSize = options.varigramSize ?? defaultHashOptions.varigramSize;

  assertValidSize(size);
  assertValidVarigramSize(vSize);

  return minHash(streamFeatures(text, options), size);
}

// Brand / wrap a Uint32Array as a Fingerprint instance.
export function asFingerprint(value: Uint32Array): Fingerprint {
  return Fingerprint.fromArray(value);
}

// 32-bit FNV-1a hash of a string.
export function hashValue(value: string): number {
  let h = 2166136261;

  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

// MurmurHash3-style 32-bit finalizer mix of a seed hash and permutation index.
export function mix(seed: number, index: number): number {
  let x = seed ^ Math.imul(index + 1, 0x9e3779b9);

  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);

  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);

  x ^= x >>> 16;

  return x >>> 0;
}

function minHashWithCount(
  items: Iterable<string | number>,
  size: number,
): { fingerprint: Fingerprint; featureCount: number } {
  assertValidSize(size);

  const fingerprint = new Fingerprint(size);
  fingerprint.fill(0xffffffff);

  // Deduplicate seeds: Set MinHash is idempotent, so duplicate seeds produce
  // identical mixes that can never reduce an already-recorded minimum.
  const seenSeeds = new Set<number>();

  for (const item of items) {
    const seed = typeof item === "number" ? (item >>> 0) : hashValue(item);

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

  return {
    fingerprint,
    featureCount: seenSeeds.size,
  };
}

// Compute a set MinHash `Fingerprint` of length `size` over any iterable stream
// of features (strings or pre-hashed 32-bit numbers).
// Automatically deduplicates item seeds to avoid redundant mix cycles.
export function minHash(
  items: Iterable<string | number>,
  size: number = defaultHashOptions.size,
): Fingerprint {
  return minHashWithCount(items, size).fingerprint;
}
