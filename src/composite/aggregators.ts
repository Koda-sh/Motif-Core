// Slot aggregator types and mathematical functions for fingerprint compositing.

export interface SlotAggregatorContext {
  // Current slot index (0 to size - 1)
  slot: number;
  // Total size of the fingerprint (e.g. 128)
  size: number;
  // Optional sample weights aligned with the values array
  weights?: readonly number[];
}

export type SlotAggregator = (
  values: ArrayLike<number>,
  context: SlotAggregatorContext,
) => number;

const UINT32_MAX = 0xffffffff;

// Round and clamp an aggregator output to a valid uint32 slot value [0, 0xffffffff].
export function normalizeSlot(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= UINT32_MAX) {
    return UINT32_MAX;
  }
  return Math.round(value) >>> 0;
}

// Per-slot minimum across member fingerprints.
export const min: SlotAggregator = (values) => {
  if (values.length === 0) {
    return 0;
  }
  let lowest = values[0]!;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < lowest) {
      lowest = values[i]!;
    }
  }
  return lowest;
};

// Per-slot maximum across member fingerprints.
export const max: SlotAggregator = (values) => {
  if (values.length === 0) {
    return 0;
  }
  let highest = values[0]!;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > highest) {
      highest = values[i]!;
    }
  }
  return highest;
};

// Per-slot arithmetic mean, supporting optional weights.
export const mean: SlotAggregator = (values, context) => {
  if (values.length === 0) {
    return 0;
  }

  const weights = context.weights;
  if (!weights || weights.length !== values.length) {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      total += values[i]!;
    }
    return total / values.length;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i]!;
    weightedSum += values[i]! * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
};

// Per-slot midpoint of min and max.
export const mid: SlotAggregator = (values) => {
  if (values.length === 0) {
    return 0;
  }
  let lowest = values[0]!;
  let highest = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < lowest) lowest = v;
    if (v > highest) highest = v;
  }
  return (lowest + highest) / 2;
};

// Per-slot sum across member fingerprints.
export const sum: SlotAggregator = (values, context) => {
  const weights = context.weights;
  let total = 0;

  if (!weights || weights.length !== values.length) {
    for (let i = 0; i < values.length; i++) {
      total += values[i]!;
    }
    return total;
  }

  for (let i = 0; i < values.length; i++) {
    total += values[i]! * weights[i]!;
  }
  return total;
};

// Factory for Generalized Power Mean: M_p(v) = (sum(w_i * v_i^p) / sum(w_i))^(1/p).
// Exponent defaults to 3 (cubic power mean feature boosting).
// Higher exponents amplify dominant features; lower exponents favor smaller values.
export function powerMean(exponent = 3): SlotAggregator {
  if (exponent === 0) {
    // Limit as p -> 0 is geometric mean
    return (values) => {
      if (values.length === 0) return 0;
      let logSum = 0;
      for (let i = 0; i < values.length; i++) {
        logSum += Math.log(Math.max(1, values[i]!));
      }
      return Math.exp(logSum / values.length);
    };
  }

  if (exponent === 3) {
    // Fast-path for cubic mean (avoids Math.pow overhead)
    return (values, context) => {
      if (values.length === 0) return 0;

      const weights = context.weights;
      if (!weights || weights.length !== values.length) {
        let total = 0;
        for (let i = 0; i < values.length; i++) {
          const v = values[i]!;
          total += v * v * v;
        }
        return Math.cbrt(total / values.length);
      }

      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < values.length; i++) {
        const v = values[i]!;
        const w = weights[i]!;
        weightedSum += v * v * v * w;
        totalWeight += w;
      }
      return totalWeight > 0 ? Math.cbrt(weightedSum / totalWeight) : 0;
    };
  }

  if (exponent === 2) {
    // Fast-path for quadratic / RMS mean
    return (values, context) => {
      if (values.length === 0) return 0;

      const weights = context.weights;
      if (!weights || weights.length !== values.length) {
        let total = 0;
        for (let i = 0; i < values.length; i++) {
          const v = values[i]!;
          total += v * v;
        }
        return Math.sqrt(total / values.length);
      }

      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < values.length; i++) {
        const v = values[i]!;
        const w = weights[i]!;
        weightedSum += v * v * w;
        totalWeight += w;
      }
      return totalWeight > 0 ? Math.sqrt(weightedSum / totalWeight) : 0;
    };
  }

  return (values, context) => {
    if (values.length === 0) {
      return 0;
    }

    const weights = context.weights;
    if (!weights || weights.length !== values.length) {
      let total = 0;
      for (let i = 0; i < values.length; i++) {
        total += Math.pow(values[i]!, exponent);
      }
      return Math.pow(total / values.length, 1 / exponent);
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < values.length; i++) {
      const w = weights[i]!;
      weightedSum += Math.pow(values[i]!, exponent) * w;
      totalWeight += w;
    }

    return totalWeight > 0 ? Math.pow(weightedSum / totalWeight, 1 / exponent) : 0;
  };
}

// Default feature-boosting aggregator using power mean with exponent 3.
export const defaultAggregator: SlotAggregator = powerMean(3);
