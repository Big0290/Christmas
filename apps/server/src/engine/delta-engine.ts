/**
 * Delta object representing changes between two states
 */
export interface Delta {
  [key: string]: any; // Changed properties
  _deleted?: string[]; // Deleted property keys
}

/**
 * DeltaEngine calculates and applies delta-based state updates.
 * 
 * Responsibilities:
 * - Compare previous state with current state using deep diffing
 * - Generate delta objects with only changed properties
 * - Support nested object deltas
 * - Apply deltas to reconstruct state
 * - Merge multiple deltas
 */
export class DeltaEngine {
  /**
   * Calculate delta between two states using deep diffing
   */
  calculateDelta(previousState: any, currentState: any): Delta {
    const delta: Delta = {};
    const deleted: string[] = [];

    // Compare all keys in current state
    for (const key in currentState) {
      if (currentState.hasOwnProperty(key)) {
        const prevValue = previousState[key];
        const currValue = currentState[key];

        if (!this.deepEqual(prevValue, currValue)) {
          // Values differ - include in delta
          if (this.isPrimitive(currValue) || currValue === null || currValue === undefined) {
            // Primitive or null/undefined - store directly
            delta[key] = currValue;
          } else if (Array.isArray(currValue)) {
            // Array - compare element by element or store full array if different
            if (!Array.isArray(prevValue) || !this.arraysEqual(prevValue, currValue)) {
              delta[key] = currValue;
            }
          } else if (typeof currValue === 'object') {
            // Object - recursive diff
            const nestedDelta = this.calculateDelta(prevValue || {}, currValue);
            if (Object.keys(nestedDelta).length > 0 || nestedDelta._deleted?.length) {
              delta[key] = nestedDelta;
            }
          }
        }
      }
    }

    // Check for deleted keys
    for (const key in previousState) {
      if (previousState.hasOwnProperty(key) && !(key in currentState)) {
        deleted.push(key);
      }
    }

    if (deleted.length > 0) {
      delta._deleted = deleted;
    }

    return delta;
  }

  /**
   * Apply delta to a base state to reconstruct current state
   */
  applyDelta(baseState: any, delta: Delta): any {
    const result = { ...baseState };

    // Apply changes
    for (const key in delta) {
      if (key === '_deleted') {
        continue;
      }

      const deltaValue = delta[key];
      const baseValue = result[key];

      if (this.isPrimitive(deltaValue) || deltaValue === null || deltaValue === undefined) {
        // Primitive or null/undefined - replace directly
        result[key] = deltaValue;
      } else if (Array.isArray(deltaValue)) {
        // Array - replace directly
        result[key] = deltaValue;
      } else if (typeof deltaValue === 'object' && deltaValue._deleted !== undefined) {
        // Nested delta - recursive apply
        result[key] = this.applyDelta(baseValue || {}, deltaValue);
      } else if (typeof deltaValue === 'object') {
        // Object - merge or replace
        result[key] = { ...(baseValue || {}), ...deltaValue };
      }
    }

    // Remove deleted keys
    if (delta._deleted) {
      for (const key of delta._deleted) {
        delete result[key];
      }
    }

    return result;
  }

  /**
   * Merge multiple deltas into a single delta
   */
  mergeDeltas(deltas: Delta[]): Delta {
    if (deltas.length === 0) {
      return {};
    }

    if (deltas.length === 1) {
      return deltas[0];
    }

    // Start with first delta
    let merged: Delta = { ...deltas[0] };
    const allDeleted = new Set(merged._deleted || []);

    // Merge subsequent deltas
    for (let i = 1; i < deltas.length; i++) {
      const delta = deltas[i];

      // Merge changes
      for (const key in delta) {
        if (key === '_deleted') {
          continue;
        }

        const deltaValue = delta[key];
        const mergedValue = merged[key];

        if (mergedValue === undefined) {
          // New key - add directly
          merged[key] = deltaValue;
        } else if (this.isPrimitive(deltaValue) || deltaValue === null || deltaValue === undefined) {
          // Primitive - replace
          merged[key] = deltaValue;
        } else if (Array.isArray(deltaValue)) {
          // Array - replace
          merged[key] = deltaValue;
        } else if (typeof deltaValue === 'object' && deltaValue._deleted !== undefined) {
          // Nested delta - recursive merge
          if (typeof mergedValue === 'object' && mergedValue._deleted !== undefined) {
            merged[key] = this.mergeDeltas([mergedValue, deltaValue]);
          } else {
            merged[key] = deltaValue;
          }
        } else if (typeof deltaValue === 'object') {
          // Object - merge
          merged[key] = { ...(mergedValue || {}), ...deltaValue };
        }
      }

      // Merge deleted keys
      if (delta._deleted) {
        for (const key of delta._deleted) {
          allDeleted.add(key);
        }
      }
    }

    if (allDeleted.size > 0) {
      merged._deleted = Array.from(allDeleted);
    }

    return merged;
  }

  /**
   * Check if two values are deeply equal
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (this.isPrimitive(a)) {
      return a === b;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      return this.arraysEqual(a, b);
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) {
        return false;
      }

      for (const key of keysA) {
        if (!keysB.includes(key)) {
          return false;
        }
        if (!this.deepEqual(a[key], b[key])) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Check if two arrays are equal
   */
  private arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!this.deepEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if value is primitive
   */
  private isPrimitive(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    );
  }

  /**
   * Calculate size of delta (for metrics)
   */
  getDeltaSize(delta: Delta): number {
    return JSON.stringify(delta).length;
  }

  /**
   * Check if delta is empty (no changes)
   */
  isEmpty(delta: Delta): boolean {
    const keys = Object.keys(delta);
    return keys.length === 0 || (keys.length === 1 && keys[0] === '_deleted' && (!delta._deleted || delta._deleted.length === 0));
  }
}

