import type {
  Shingle,
  Token,
  TokenizationOptions,
  TokenizationResult,
  Unigram,
  Varigram,
} from "../types.js";

const FILTER_REGEX = /[^a-z0-9!@#$%^&*()_\-+=~`<>,.?/"':;}{\[\] ]/g;
const STRIP_REGEX = /[^a-z0-9]/g;

// Common Stop words
export const DEFAULT_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
  "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
  "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
  "some", "such", "than", "that", "that's", "the", "their", "theirs", "them",
  "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll",
  "they're", "they've", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're",
  "we've", "were", "weren't", "what", "what's", "when", "when's", "where",
  "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with",
  "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
  "your", "yours", "yourself", "yourselves",
]);

export const defaultTokenizationOptions = {
  varigramSize: 2,
  normalize: true,
} as const;

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

export function resolveStopWords(
  stopWords?: boolean | Set<string> | readonly string[],
): Set<string> | null {
  if (!stopWords) {
    return null;
  }
  if (stopWords === true) {
    return DEFAULT_STOP_WORDS;
  }
  if (stopWords instanceof Set) {
    return stopWords;
  }
  return new Set(stopWords);
}

// Lowercase text and retain only standard ASCII alphanumeric and punctuation characters.
export function filterText(text: string): string {
  assertValidString(text, "text");
  return text.toLowerCase().replace(FILTER_REGEX, "");
}

// Lowercase text and strip everything except ASCII alphanumeric characters (`a-z0-9`).
// Performs a single pass over the string for performance.
export function stripText(text: string): string {
  assertValidString(text, "text");
  return text.toLowerCase().replace(STRIP_REGEX, "");
}

// Split text into word tokens. Optionally normalizes and filters stop words.
export function createTokens(
  text: string,
  normalize = true,
  stopWords?: boolean | Set<string> | readonly string[],
): Token[] {
  assertValidString(text, "text");

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const raw = trimmed.split(/\s+/).filter((part) => part.length > 0);
  const stopWordsSet = resolveStopWords(stopWords);

  let tokens = raw;
  if (normalize) {
    tokens = tokens.map(filterText).filter((token) => token.length > 0);
  }

  if (stopWordsSet) {
    tokens = tokens.filter((token) => {
      const stripped = stripText(token);
      return !stopWordsSet.has(stripped);
    });
  }

  return tokens;
}

// Build stripped unigrams from text (one per token).
export function createUnigrams(
  text: string,
  normalize = true,
  stopWords?: boolean | Set<string> | readonly string[],
): Unigram[] {
  return unigramsFromTokens(createTokens(text, normalize, stopWords), normalize);
}

// Build overlapping word varigrams. When `normalize` is on, each varigram is stripped.
export function createVarigrams(
  text: string,
  varigramSize: number,
  normalize = true,
  stopWords?: boolean | Set<string> | readonly string[],
): Varigram[] {
  assertValidVarigramSize(varigramSize);
  return varigramsFromTokens(
    createTokens(text, normalize, stopWords),
    varigramSize,
    normalize,
  );
}

// Build overlapping character shingles (sub-word n-grams) from text.
// Useful for typo-resilient fingerprinting and non-space-delimited languages.
export function createShingles(
  text: string,
  shingleSize = 3,
  normalize = true,
): Shingle[] {
  assertValidString(text, "text");
  assertValidShingleSize(shingleSize);

  const cleaned = normalize ? stripText(text) : text;
  const count = cleaned.length - shingleSize + 1;
  if (count <= 0) {
    return [];
  }

  const shingles: Shingle[] = [];
  for (let i = 0; i < count; i++) {
    shingles.push(cleaned.slice(i, i + shingleSize));
  }

  return shingles;
}

// Tokenize text into filtered tokens, stripped unigrams, stripped varigrams, and optional character shingles.
export function tokenize(
  text: string,
  options: TokenizationOptions = {},
): TokenizationResult {
  const varigramSize =
    options.varigramSize ?? defaultTokenizationOptions.varigramSize;
  const normalize = options.normalize ?? defaultTokenizationOptions.normalize;

  assertValidVarigramSize(varigramSize);
  if (options.shingleSize !== undefined) {
    assertValidShingleSize(options.shingleSize);
  }

  const tokens = createTokens(text, normalize, options.stopWords);
  const shingles = options.shingleSize
    ? createShingles(text, options.shingleSize, normalize)
    : [];

  return {
    tokens,
    unigrams: unigramsFromTokens(tokens, normalize),
    varigrams: varigramsFromTokens(tokens, varigramSize, normalize),
    shingles,
  };
}

// Extract unigrams from an existing array of tokens.
export function unigramsFromTokens(
  tokens: readonly Token[],
  normalize = true,
): Unigram[] {
  if (!normalize) {
    return [...tokens];
  }

  const unigrams: Unigram[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const stripped = stripText(tokens[i]!);
    if (stripped.length > 0) {
      unigrams.push(stripped);
    }
  }

  return unigrams;
}

// Extract overlapping word varigrams from an existing array of tokens.
export function varigramsFromTokens(
  tokens: readonly Token[],
  varigramSize: number,
  normalize = true,
): Varigram[] {
  assertValidVarigramSize(varigramSize);

  const count = tokens.length - varigramSize + 1;
  if (count <= 0) {
    return [];
  }

  const varigrams: Varigram[] = [];

  for (let i = 0; i < count; i++) {
    // Avoid allocating temporary slices: build joined string directly
    let joined = tokens[i]!;
    for (let j = 1; j < varigramSize; j++) {
      joined += " " + tokens[i + j]!;
    }

    if (!normalize) {
      varigrams.push(joined);
    } else {
      const stripped = stripText(joined);
      if (stripped.length > 0) {
        varigrams.push(stripped);
      }
    }
  }

  return varigrams;
}
