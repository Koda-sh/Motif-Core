// Core token types
export type Token = string;
export type Unigram = string;
export type Varigram = string;

// Core fingerprint type
export type Fingerprint = Uint32Array & {
  readonly __fingerprint: true;
};

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
  normalize?: boolean;
}

// Tokenization related types
export interface TokenizationOptions {
  varigramSize?: number;
  normalize?: boolean;
}

export interface TokenizationResult {
  tokens: Token[];
  unigrams: Unigram[];
  varigrams: Varigram[];
}

// Comparison related types
export interface ComparisonResult {
  similarity: number; // percentage (0.0 to 1.0) of similarity between the two fingerprints
  distance: number; // number of different entries between the two fingerprints
  matches: number; // number of matching entries between the two fingerprints
  size: number; // size of the fingerprint
}
