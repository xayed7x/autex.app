/**
 * BigInt Serialization Fix
 * 
 * This module patches the BigInt prototype to enable JSON serialization.
 * JSON.stringify() cannot handle BigInt values by default, which causes
 * "TypeError: Do not know how to serialize a BigInt" errors.
 * 
 * Import this module at the top of any API route that deals with BigInt values
 * (e.g., Facebook page IDs which are very large numbers).
 */

// Extend BigInt prototype to support JSON serialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

export {};
