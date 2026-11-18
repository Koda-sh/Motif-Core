<p align="center">
  <img src="./docs/images/coheader.png" alt="Motif Core" width="100%" />
</p>

# @koda.sh/motif-core

**Motif Core** is a lightweight, zero-dependency TypeScript toolkit for generating, comparing, compositing, and indexing MinHash content fingerprints.

## Installation

```bash
npm install @koda.sh/motif-core
```

## Quick Start

### Hashing & Comparison

```ts
import { hash, createFingerprint, containment } from "@koda.sh/motif-core";

// Create versioned FingerprintRecords (includes featureCount for containment)
const docA = hash("The quick brown fox jumps over the lazy dog");
const docB = hash("The quick brown fox leaps over the lazy dog");

// Compare directly via Fingerprint methods
console.log(docA.fingerprint.similarity(docB.fingerprint)); // Jaccard similarity (0.0 - 1.0)
console.log(docA.fingerprint.compare(docB.fingerprint));    // { similarity, distance, matches, size }

// Or create raw Fingerprints directly
const fp = createFingerprint("Sample text", {
  size: 128,
  varigramSize: 4,
  shingleSize: 3,   // Optional character n-grams for typo resilience
  stopWords: true,  // Optional built-in stop-word filtering
});

// Estimate containment of an excerpt inside a larger document
const excerpt = hash("quick brown fox");
const full = hash("In the forest, the quick brown fox jumps over the lazy dog.");
console.log(containment(excerpt, full));
```

### Composite Fingerprints

Combine multiple fingerprints or text samples into a single prototype fingerprint with customizable slot aggregation and power-mean feature boosting:

```ts
import { composite, Composite, powerMean, min } from "@koda.sh/motif-core";

// One-shot functional composite (defaults to powerMean(3))
const topicFp = composite([
  "quantum computing algorithms qubits",
  "quantum decoherence error correction",
  "quantum teleportation entanglement",
]);

// Weighted compositing
const weighted = composite([
  ["canonical documentation", 5],
  ["noisy example", 1],
], { aggregator: powerMean(3) });

// Stateful lazy-evaluated Composite
const group = new Composite({ aggregator: min });
group.add("first example").set("second", "second example", 2);
console.log(group.fingerprint.similarity(topicFp));
```

### LSH Band Keys

Generate Locality Sensitive Hashing (LSH) band keys or raw 32-bit band hashes for sub-linear candidate lookup:

```ts
import { createFingerprint, optimalBands, hasBandCollision } from "@koda.sh/motif-core";

const fp = createFingerprint("Distributed consensus protocols in asynchronous networks");

// Formatted hex band keys (e.g. ["0:1a2b3c4d", ...])
const keys = fp.bandKeys({ bands: 16 });

// Raw Uint32Array band hashes (zero string allocations)
const hashes = fp.bandHashes({ bands: 16 });

// Find optimal (bands, rows) for a target Jaccard threshold
const config = optimalBands(0.7, 128);
```

## License

[MPL-2.0](./LICENSE)

<p align="center">
  <img src="./docs/images/kmfooter.png" alt="Koda / Motif" width="100%" />
</p>
