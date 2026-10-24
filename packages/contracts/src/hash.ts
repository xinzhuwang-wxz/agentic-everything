import { createHash } from 'node:crypto';
import { JsonValueSchema, type JsonValue } from './runtime.js';

/** JSON-only canonicalization: recursively ordered keys, no undefined/NaN/secrets special cases. */
export function canonicalJson(value: JsonValue): string {
  JsonValueSchema.parse(value);
  function encode(item: JsonValue): string {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key]!)}`).join(',')}}`;
  }
  return encode(value);
}
export function contentHash(value: JsonValue): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
