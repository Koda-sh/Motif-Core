import type {
  Token,
  TokenizationOptions,
  TokenizationResult,
  Unigram,
  Varigram,
} from "../types.js";

const FILTER_REGEX = /[^a-z0-9!@#$%^&*()_\-+=~`<>,.?/"':;}{\[\] ]/g;
const STRIP_REGEX = /[^a-z0-9]/g;

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

function assertValidString(value: unknown, paramName = "text"): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(
      `Expected ${paramName} to be a string, received ${typeof value}`,
    );
  }
}

/**
 * Lowercase text and retain only standard ASCII alphanumeric and punctuation characters.
 */
export function textFilter(text: string): string {
  assertValidString(text, "text");
  return text.toLowerCase().replace(FILTER_REGEX, "");
}

/**
 * Lowercase text and strip everything except ASCII alphanumeric characters (`a-z0-9`).
 * Performs a single pass over the string for performance.
 */
export function textStrip(text: string): string {
  assertValidString(text, "text");
  return text.toLowerCase().replace(STRIP_REGEX, "");
}

/**
 * Split text into word tokens. When `normalize` is on, each token is filtered via `textFilter`.
 */
export function createTokens(text: string, normalize = true): Token[] {
  assertValidString(text, "text");

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const raw = trimmed.split(/\s+/).filter((part) => part.length > 0);

  if (!normalize) {
    return raw;
  }

  return raw.map(textFilter).filter((token) => token.length > 0);
}

/**
 * Build stripped unigrams from text (one per token).
 */
export function createUnigrams(text: string, normalize = true): Unigram[] {
  return unigramsFromTokens(createTokens(text, normalize), normalize);
}

/**
 * Build overlapping word varigrams. When `normalize` is on, each varigram is stripped.
 */
export function createVarigrams(
  text: string,
  varigramSize: number,
  normalize = true,
): Varigram[] {
  assertValidVarigramSize(varigramSize);
  return varigramsFromTokens(
    createTokens(text, normalize),
    varigramSize,
    normalize,
  );
}

/**
 * Tokenize text into filtered tokens, stripped unigrams, and stripped varigrams.
 */
export function tokenize(
  text: string,
  options: TokenizationOptions = {},
): TokenizationResult {
  const varigramSize =
    options.varigramSize ?? defaultTokenizationOptions.varigramSize;
  const normalize = options.normalize ?? defaultTokenizationOptions.normalize;

  assertValidVarigramSize(varigramSize);

  const tokens = createTokens(text, normalize);

  return {
    tokens,
    unigrams: unigramsFromTokens(tokens, normalize),
    varigrams: varigramsFromTokens(tokens, varigramSize, normalize),
  };
}

/**
 * Extract unigrams from an existing array of tokens.
 */
export function unigramsFromTokens(
  tokens: readonly Token[],
  normalize = true,
): Unigram[] {
  if (!normalize) {
    return [...tokens];
  }

  const unigrams: Unigram[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const stripped = textStrip(tokens[i]!);
    if (stripped.length > 0) {
      unigrams.push(stripped);
    }
  }

  return unigrams;
}

/**
 * Extract overlapping word varigrams from an existing array of tokens.
 */
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
      const stripped = textStrip(joined);
      if (stripped.length > 0) {
        varigrams.push(stripped);
      }
    }
  }

  return varigrams;
}
