import type { ComparisonResult } from "../types.js";

// First-class Fingerprint representation extending native Uint32Array.
// Provides both native typed array performance and high-level similarity methods.
export class Fingerprint extends Uint32Array {
  // Compare this fingerprint to another fingerprint.
  compare(other: Uint32Array): ComparisonResult {
    return compare(this, other);
  }

  // Calculate Jaccard similarity (0.0 to 1.0) against another fingerprint.
  similarity(other: Uint32Array): number {
    return similarity(this, other);
  }

  // Calculate Hamming distance (number of differing indices) against another fingerprint.
  distance(other: Uint32Array): number {
    return distance(this, other);
  }

  // Count the number of identical indices between this and another fingerprint.
  matches(other: Uint32Array): number {
    return countMatches(this, other);
  }

  // Estimate containment percentage (0.0 to 1.0) of this fingerprint inside a target superset.
  // Requires the unique feature counts of both documents.
  containment(other: Uint32Array, thisFeatureCount: number, otherFeatureCount: number): number {
    return containment(this, other, thisFeatureCount, otherFeatureCount);
  }

  // Wrap any existing Uint32Array as a Fingerprint without copying.
  static fromArray(arr: Uint32Array): Fingerprint {
    if (arr instanceof Fingerprint) {
      return arr;
    }
    Object.setPrototypeOf(arr, Fingerprint.prototype);
    return arr as Fingerprint;
  }
}

function assertMatchingLengths(a: Uint32Array, b: Uint32Array): void {
  if (a.length !== b.length) {
    throw new RangeError(
      `Fingerprint size mismatch: left has size ${a.length}, right has size ${b.length}`,
    );
  }
}

// Count matching indices between two equal-length fingerprints.
export function countMatches(a: Uint32Array, b: Uint32Array): number {
  assertMatchingLengths(a, b);

  let matchCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      matchCount++;
    }
  }

  return matchCount;
}

// Calculate Jaccard similarity score (0.0 to 1.0) between two fingerprints.
export function similarity(a: Uint32Array, b: Uint32Array): number {
  assertMatchingLengths(a, b);
  if (a.length === 0) {
    return 1;
  }

  return countMatches(a, b) / a.length;
}

// Calculate Hamming distance between two fingerprints.
export function distance(a: Uint32Array, b: Uint32Array): number {
  assertMatchingLengths(a, b);
  return a.length - countMatches(a, b);
}

// Estimate containment of document A in document B using the MinHash Jaccard inversion formula:
// C(A, B) = (|A ∩ B|) / |A| = (J * (|A| + |B|)) / (|A| * (1 + J))
export function containment(
  a: Uint32Array,
  b: Uint32Array,
  aFeatureCount: number,
  bFeatureCount: number,
): number {
  if (aFeatureCount <= 0) {
    return 0;
  }

  const j = similarity(a, b);
  if (j <= 0) {
    return 0;
  }

  const estimated = (j * (aFeatureCount + bFeatureCount)) / (aFeatureCount * (1 + j));
  return Math.min(1, Math.max(0, estimated));
}

// Compare two fingerprints and return a comprehensive ComparisonResult.
export function compare(a: Uint32Array, b: Uint32Array): ComparisonResult {
  assertMatchingLengths(a, b);

  const totalMatches = countMatches(a, b);
  const size = a.length;

  return {
    similarity: size === 0 ? 1 : totalMatches / size,
    distance: size - totalMatches,
    matches: totalMatches,
    size,
  };
}

