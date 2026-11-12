import { Fingerprint } from "../fingerprint/fingerprint.js";
import { createFingerprint, defaultHashOptions } from "../minhash/hash.js";
import type { ComparisonResult, HashOptions } from "../types.js";
import {
  defaultAggregator,
  normalizeSlot,
  type SlotAggregator,
  type SlotAggregatorContext,
} from "./aggregators.js";

export interface CompositeOptions {
  // Hash options applied when text strings are provided as input
  create?: HashOptions;
  // Slot aggregation strategy (defaults to powerMean with exponent 3)
  aggregator?: SlotAggregator;
  // Fallback fingerprint size when the collection is empty (default: 128)
  emptySize?: number;
}

export interface CompositeEntry {
  fingerprint: Fingerprint;
  weight: number;
  text?: string;
}

function resolveFingerprint(
  source: Fingerprint | string,
  createOptions?: HashOptions,
): { fingerprint: Fingerprint; text?: string } {
  if (typeof source === "string") {
    return {
      fingerprint: createFingerprint(source, createOptions),
      text: source,
    };
  }

  if (source instanceof Uint32Array) {
    return {
      fingerprint: Fingerprint.fromArray(source),
    };
  }

  throw new TypeError("Expected source to be a string or Fingerprint (Uint32Array)");
}

// Build a single composite Fingerprint from an iterable collection of fingerprints or text samples.
export function composite(
  sources: Iterable<Fingerprint | string | [Fingerprint | string, number]>,
  options: CompositeOptions = {},
): Fingerprint {
  const aggregator = options.aggregator ?? defaultAggregator;
  const emptySize = options.emptySize ?? options.create?.size ?? defaultHashOptions.size;

  const fingerprints: Fingerprint[] = [];
  const weights: number[] = [];

  for (const item of sources) {
    if (Array.isArray(item) && item.length === 2 && typeof item[1] === "number") {
      const { fingerprint } = resolveFingerprint(item[0], options.create);
      fingerprints.push(fingerprint);
      weights.push(item[1]);
    } else {
      const { fingerprint } = resolveFingerprint(item as Fingerprint | string, options.create);
      fingerprints.push(fingerprint);
      weights.push(1);
    }
  }

  if (fingerprints.length === 0) {
    const empty = new Fingerprint(emptySize);
    empty.fill(0);
    return empty;
  }

  const size = fingerprints[0]!.length;
  for (let i = 1; i < fingerprints.length; i++) {
    if (fingerprints[i]!.length !== size) {
      throw new RangeError(
        `Composite fingerprint size mismatch: expected ${size}, received ${fingerprints[i]!.length}`,
      );
    }
  }

  const out = new Fingerprint(size);
  const slotValues = new Float64Array(fingerprints.length);
  const context: SlotAggregatorContext = {
    slot: 0,
    size,
    weights,
  };

  for (let slot = 0; slot < size; slot++) {
    for (let g = 0; g < fingerprints.length; g++) {
      slotValues[g] = fingerprints[g]![slot]!;
    }
    context.slot = slot;
    out[slot] = normalizeSlot(aggregator(slotValues, context));
  }

  return out;
}

// Stateful Composite container for incrementally accumulating and fusing fingerprints.
// Employs lazy evaluation: the aggregated fingerprint is computed once upon request
// and cached until items are added or removed.
export class Composite {
  private readonly options: CompositeOptions;
  private readonly store: Map<string, CompositeEntry> = new Map();
  private cached: Fingerprint | null = null;
  private establishedSize: number | undefined;
  private autoIdCounter = 0;

  constructor(options: CompositeOptions = {}) {
    this.options = options;
  }

  // Add an item without an explicit key (assigns an internal auto-incrementing ID).
  add(source: Fingerprint | string, weight = 1): this {
    const key = `_auto_${this.autoIdCounter++}`;
    return this.set(key, source, weight);
  }

  // Set an item under a specific identifier key.
  set(key: string, source: Fingerprint | string, weight = 1): this {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("Expected key to be a non-empty string");
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`Weight must be a positive number, received ${weight}`);
    }

    const { fingerprint, text } = resolveFingerprint(source, this.options.create);
    this.assertSize(fingerprint);

    this.store.set(key, { fingerprint, weight, text });
    this.cached = null; // Invalidate cache
    return this;
  }

  // Add multiple items in batch (array, iterable, or key-value object).
  addMany(
    sources:
      | Iterable<Fingerprint | string | [string, Fingerprint | string] | [string, Fingerprint | string, number]>
      | Record<string, Fingerprint | string>,
  ): this {
    if (sources && typeof (sources as any)[Symbol.iterator] === "function") {
      for (const item of sources as Iterable<any>) {
        if (Array.isArray(item)) {
          if (item.length === 3) {
            this.set(item[0], item[1], item[2]);
          } else if (item.length === 2 && typeof item[0] === "string") {
            this.set(item[0], item[1]);
          } else {
            this.add(item[0]);
          }
        } else {
          this.add(item);
        }
      }
    } else if (sources && typeof sources === "object") {
      for (const [k, v] of Object.entries(sources)) {
        this.set(k, v);
      }
    }
    return this;
  }

  // Delete an entry by key.
  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.cached = null;
      if (this.store.size === 0) {
        this.establishedSize = undefined;
      }
    }
    return deleted;
  }

  // Alias for delete.
  remove(key: string): boolean {
    return this.delete(key);
  }

  // Check if a key exists in the collection.
  has(key: string): boolean {
    return this.store.has(key);
  }

  // Retrieve an entry by key.
  get(key: string): CompositeEntry | undefined {
    return this.store.get(key);
  }

  // Clear all items from the collection.
  clear(): void {
    this.store.clear();
    this.cached = null;
    this.establishedSize = undefined;
  }

  // Number of stored fingerprint entries.
  get size(): number {
    return this.store.size;
  }

  // Alias for size.
  get count(): number {
    return this.store.size;
  }

  // Iterate over entry keys.
  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  // Iterate over entries.
  entries(): IterableIterator<[string, CompositeEntry]> {
    return this.store.entries();
  }

  // Lazily retrieve the aggregated composite Fingerprint.
  get fingerprint(): Fingerprint {
    if (this.cached !== null) {
      return this.cached;
    }

    const emptySize =
      this.options.emptySize ?? this.options.create?.size ?? defaultHashOptions.size;

    if (this.store.size === 0) {
      const empty = new Fingerprint(emptySize);
      empty.fill(0);
      this.cached = empty;
      return empty;
    }

    const aggregator = this.options.aggregator ?? defaultAggregator;
    const entries = Array.from(this.store.values());
    const size = entries[0]!.fingerprint.length;

    const out = new Fingerprint(size);
    const slotValues = new Float64Array(entries.length);
    const weights = entries.map((e) => e.weight);
    const context: SlotAggregatorContext = {
      slot: 0,
      size,
      weights,
    };

    for (let slot = 0; slot < size; slot++) {
      for (let g = 0; g < entries.length; g++) {
        slotValues[g] = entries[g]!.fingerprint[slot]!;
      }
      context.slot = slot;
      out[slot] = normalizeSlot(aggregator(slotValues, context));
    }

    this.cached = out;
    return out;
  }

  // Calculate similarity against another fingerprint.
  similarity(other: Uint32Array): number {
    return this.fingerprint.similarity(other);
  }

  // Compare against another fingerprint.
  compare(other: Uint32Array): ComparisonResult {
    return this.fingerprint.compare(other);
  }

  private assertSize(fp: Fingerprint): void {
    if (this.establishedSize === undefined) {
      this.establishedSize = fp.length;
      return;
    }
    if (fp.length !== this.establishedSize) {
      throw new RangeError(
        `Composite fingerprint size mismatch: expected ${this.establishedSize}, received ${fp.length}`,
      );
    }
  }
}

