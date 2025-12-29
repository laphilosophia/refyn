import type { Schema, SchemaField, SchemaRule } from '../types.js';

/**
 * Get a value from an object by dot-notation path
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array access like "items[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = (current as Record<string, unknown>)[key!];
      if (Array.isArray(current)) {
        current = current[parseInt(index!, 10)];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Cast a value to the specified type
 */
export function castValue(value: unknown, cast: SchemaRule['cast']): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  switch (cast) {
    case 'string':
      return String(value);

    case 'number': {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }

    case 'bigint':
      try {
        return BigInt(value as string | number);
      } catch {
        return null;
      }

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      return Boolean(value);

    case 'date': {
      if (value instanceof Date) return value;
      const date = new Date(value as string | number);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    default:
      return value;
  }
}

/**
 * Check if a field is a nested schema (object with sub-fields)
 */
function isNestedSchema(field: SchemaField | Schema): field is Schema {
  if (typeof field === 'string') return false;
  // Check for known SchemaRule properties
  const ruleProps = ['path', 'cast', 'mapArray', 'default', 'nullable', 'compute', 'validate', 'transform', 'item'];
  if (ruleProps.some(prop => prop in field)) {
    return false;
  }
  return typeof field === 'object' && field !== null;
}

/**
 * Normalize a schema field to a full rule object
 */
function normalizeField(field: SchemaField): SchemaRule {
  if (typeof field === 'string') {
    return { path: field };
  }
  return field;
}

/**
 * Apply compute function to get value from multiple paths
 */
function applyCompute(
  row: unknown,
  compute: NonNullable<SchemaRule['compute']>
): unknown {
  const values = compute.paths.map(p => getByPath(row, p));

  switch (compute.fn) {
    case 'concat':
      return values
        .filter(v => v !== null && v !== undefined)
        .map(String)
        .join(compute.separator ?? ' ');

    case 'sum':
      return values
        .filter(v => typeof v === 'number')
        .reduce((acc: number, v) => acc + (v as number), 0);

    case 'first':
      return values.find(v => v !== null && v !== undefined);

    case 'coalesce':
      return values.find(v => v !== null && v !== undefined && v !== '');

    case 'template':
      if (!compute.template) return null;
      return compute.template.replace(/\{(\d+)\}/g, (_, idx) => {
        const val = values[parseInt(idx, 10)];
        return val !== null && val !== undefined ? String(val) : '';
      });

    default:
      return null;
  }
}

/**
 * Apply a schema to a single row of data
 */
export function applySchema(row: unknown, schema: Schema): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(schema)) {
    // Check if this is a nested schema (object with sub-fields)
    if (isNestedSchema(field)) {
      result[key] = applySchema(row, field);
      continue;
    }

    const rule = normalizeField(field);

    // Handle array mapping
    if (rule.mapArray) {
      const sourceArray = getByPath(row, rule.mapArray);
      if (Array.isArray(sourceArray) && rule.item) {
        result[key] = sourceArray.map(item => applySchema(item, rule.item!));
      } else {
        result[key] = [];
      }
      continue;
    }

    // Handle computed fields
    let value: unknown;
    if (rule.compute) {
      value = applyCompute(row, rule.compute);
    } else {
      // Get value by path
      value = rule.path ? getByPath(row, rule.path) : row;
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      if ('default' in rule) {
        value = rule.default;
      } else if (rule.nullable) {
        value = null;
      } else {
        value = undefined;
      }
    } else if (rule.cast) {
      // Apply type casting
      value = castValue(value, rule.cast);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Transform an array of data using the schema
 */
export function transform(data: unknown[], schema: Schema): unknown[] {
  return data.map(row => applySchema(row, schema));
}
