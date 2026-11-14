// LSH (Locality Sensitive Hashing) banding utilities for MinHash fingerprints.

export interface LshBandOptions {
  // Number of bands (b). Defaults to 16 for a 128-size fingerprint.
  bands?: number;
  // Number of rows per band (r). Defaults to size / bands.
  rows?: number;
}

export interface ResolvedBands {
  // Number of bands
  bands: number;
  // Number of rows per band
  rows: number;
  // Total slots covered (bands * rows)
  totalSlots: number;
  // Approximate Jaccard similarity threshold: tau = (1/b)^(1/r)
  threshold: number;
}

const DEFAULT_BANDS = 16;
const FNV_PRIME = 16777619;
const FNV_OFFSET_BASIS = 2166136261;

// Resolve and validate bands and rows configuration against fingerprint size.
export function resolveBands(
  fingerprintSize: number,
  options: LshBandOptions = {},
): ResolvedBands {
  if (!Number.isInteger(fingerprintSize) || fingerprintSize < 1) {
    throw new RangeError(
      `Fingerprint size must be an integer >= 1, received ${fingerprintSize}`,
    );
  }

  let bands = options.bands;
  let rows = options.rows;

  if (bands !== undefined && rows !== undefined) {
    if (!Number.isInteger(bands) || bands < 1) {
      throw new RangeError(`bands must be an integer >= 1, received ${bands}`);
    }
    if (!Number.isInteger(rows) || rows < 1) {
      throw new RangeError(`rows must be an integer >= 1, received ${rows}`);
    }
  } else if (bands !== undefined) {
    if (!Number.isInteger(bands) || bands < 1) {
      throw new RangeError(`bands must be an integer >= 1, received ${bands}`);
    }
    rows = Math.floor(fingerprintSize / bands);
    if (rows < 1) {
      throw new RangeError(
        `bands (${bands}) cannot exceed fingerprint size (${fingerprintSize})`,
      );
    }
  } else if (rows !== undefined) {
    if (!Number.isInteger(rows) || rows < 1) {
      throw new RangeError(`rows must be an integer >= 1, received ${rows}`);
    }
    bands = Math.floor(fingerprintSize / rows);
    if (bands < 1) {
      throw new RangeError(
        `rows (${rows}) cannot exceed fingerprint size (${fingerprintSize})`,
      );
    }
  } else {
    // Default fallback: 16 bands or max possible bands
    bands = Math.min(DEFAULT_BANDS, fingerprintSize);
    rows = Math.floor(fingerprintSize / bands);
  }

  const totalSlots = bands * rows;
  if (totalSlots > fingerprintSize) {
    throw new RangeError(
      `bands * rows (${bands} * ${rows} = ${totalSlots}) exceeds fingerprint size (${fingerprintSize})`,
    );
  }

  const threshold = Math.pow(1 / bands, 1 / rows);

  return {
    bands,
    rows,
    totalSlots,
    threshold,
  };
}

// Compute a 32-bit FNV-1a hash over a slice of 32-bit unsigned integers in a band.
export function hashBandSlice(
  values: ArrayLike<number>,
  start: number,
  end: number,
): number {
  let h = FNV_OFFSET_BASIS;

  for (let i = start; i < end; i++) {
    const v = values[i]! >>> 0;
    // Hash each byte of the 32-bit slot value
    h ^= v & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }

  return h >>> 0;
}

// Format a band key string given the band index and 32-bit hash value.
// Produces a compact hex string (e.g. "0:1a2b3c4d").
export function formatBandKey(bandIndex: number, bandHash: number): string {
  return `${bandIndex}:${(bandHash >>> 0).toString(16).padStart(8, "0")}`;
}

// Generate a Uint32Array of raw 32-bit LSH band hashes from a fingerprint (zero string allocations).
export function getBandHashes(
  fingerprint: Uint32Array,
  options: LshBandOptions = {},
): Uint32Array {
  const { bands, rows } = resolveBands(fingerprint.length, options);
  const hashes = new Uint32Array(bands);

  for (let b = 0; b < bands; b++) {
    const start = b * rows;
    const end = start + rows;
    hashes[b] = hashBandSlice(fingerprint, start, end);
  }

  return hashes;
}

// Generate an array of LSH band keys from a fingerprint.
export function getBandKeys(
  fingerprint: Uint32Array,
  options: LshBandOptions = {},
): string[] {
  const hashes = getBandHashes(fingerprint, options);
  const keys: string[] = new Array(hashes.length);

  for (let b = 0; b < hashes.length; b++) {
    keys[b] = formatBandKey(b, hashes[b]!);
  }

  return keys;
}

// Find the optimal bands (b) and rows (r) factoring for a given target Jaccard similarity.
export function optimalBands(
  targetSimilarity: number,
  size = 128,
): ResolvedBands {
  if (targetSimilarity <= 0 || targetSimilarity >= 1) {
    throw new RangeError(
      `targetSimilarity must be between 0 and 1 (exclusive), received ${targetSimilarity}`,
    );
  }

  let bestBands = 1;
  let bestRows = size;
  let minDiff = Number.POSITIVE_INFINITY;

  for (let b = 1; b <= size; b++) {
    const r = Math.floor(size / b);
    if (r < 1) break;

    const t = Math.pow(1 / b, 1 / r);
    const diff = Math.abs(t - targetSimilarity);
    if (diff < minDiff) {
      minDiff = diff;
      bestBands = b;
      bestRows = r;
    }
  }

  return resolveBands(size, { bands: bestBands, rows: bestRows });
}

// Check if two sets of band keys share at least one common band bucket (LSH collision).
export function hasBandCollision(
  keysA: readonly string[],
  keysB: readonly string[],
): boolean {
  if (keysA.length === 0 || keysB.length === 0) {
    return false;
  }

  const setA = new Set(keysA);
  for (let i = 0; i < keysB.length; i++) {
    if (setA.has(keysB[i]!)) {
      return true;
    }
  }

  return false;
}

// Count how many band buckets two sets of band keys share in common.
export function countBandCollisions(
  keysA: readonly string[],
  keysB: readonly string[],
): number {
  if (keysA.length === 0 || keysB.length === 0) {
    return 0;
  }

  const setA = new Set(keysA);
  let collisions = 0;
  for (let i = 0; i < keysB.length; i++) {
    if (setA.has(keysB[i]!)) {
      collisions++;
    }
  }

  return collisions;
}

