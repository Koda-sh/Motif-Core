import type { Fingerprint } from "./fingerprint/fingerprint.js";

// Core token types
export type Token = string;
export type Unigram = string;
export type Varigram = string;
export type Shingle = string;

// Re-export Fingerprint class type
export type { Fingerprint } from "./fingerprint/fingerprint.js";

// Hashing / Creation related types
export interface FingerprintSignature {
  version: number; // version of hash.ts used
  fingerprint: Fingerprint; // the fingerprint itself
}

export interface FingerprintRecord extends FingerprintSignature {
  createdAt: number; // ms since epoch
}

export interface HashOptions {
  size?: number;
  varigramSize?: number;
  shingleSize?: number;
  stopWords?: boolean | Set<string> | readonly string[];
  normalize?: boolean;
}

// Tokenization related types
export interface TokenizationOptions {
  varigramSize?: number;
  shingleSize?: number;
  stopWords?: boolean | Set<string> | readonly string[];
  normalize?: boolean;
}

export interface TokenizationResult {
  tokens: Token[];
  unigrams: Unigram[];
  varigrams: Varigram[];
  shingles: Shingle[];
}

// Comparison related types
export interface ComparisonResult {
  similarity: number; // percentage (0.0 to 1.0) of Jaccard similarity between the two fingerprints
  distance: number; // number of different entries (Hamming distance) between the two fingerprints
  matches: number; // number of matching entries between the two fingerprints
  size: number; // size of the fingerprint
  containment?: number; // estimated containment percentage (0.0 to 1.0) if feature counts were supplied
}

// Composite related types
export type {
  CompositeEntry,
  CompositeOptions,
} from "./composite/composite.js";
export type {
  SlotAggregator,
  SlotAggregatorContext,
} from "./composite/aggregators.js";
