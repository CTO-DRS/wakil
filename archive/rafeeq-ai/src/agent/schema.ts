// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Strict validation of tool-call arguments against a tool's schema.
 * Deliberately hand-rolled (zero dependencies): the schema subset is tiny and
 * the grammar already constrains shape — this is the defense in depth that
 * rejects wrong types, missing required keys and unknown keys before a tool
 * ever runs.
 */

import type { ToolParam, ToolSchema } from './types';

export type ArgsValidation = { ok: true } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateParam(name: string, param: ToolParam, value: unknown): ArgsValidation {
  if (param.enum) {
    if (typeof value !== 'string' || !param.enum.includes(value)) {
      return { ok: false, error: `${name}: expected one of ${param.enum.join(' | ')}` };
    }
    return { ok: true };
  }
  switch (param.type) {
    case 'string':
      if (typeof value !== 'string') return { ok: false, error: `${name}: expected a string` };
      if (value.trim().length === 0) return { ok: false, error: `${name}: must not be empty` };
      return { ok: true };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `${name}: expected a finite number` };
      }
      return { ok: true };
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { ok: false, error: `${name}: expected an integer` };
      }
      return { ok: true };
    case 'boolean':
      if (typeof value !== 'boolean') return { ok: false, error: `${name}: expected a boolean` };
      return { ok: true };
    default:
      return { ok: false, error: `${name}: unsupported parameter type` };
  }
}

/**
 * Validates parsed call arguments against the tool schema:
 * the payload must be a plain object, provide every required property with a
 * value of the declared type, and contain nothing the schema does not declare.
 */
export function validateArgs(schema: ToolSchema, args: unknown): ArgsValidation {
  if (!isPlainObject(args)) return { ok: false, error: 'arguments: expected a JSON object' };
  for (const key of schema.required) {
    if (!(key in args)) return { ok: false, error: `${key}: required` };
  }
  for (const [key, value] of Object.entries(args)) {
    const param = schema.properties[key];
    if (!param) return { ok: false, error: `${key}: unknown argument` };
    if (param.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const element = validateParam(`${key}[${i}]`, param.items, value[i]);
        if (!element.ok) return element;
      }
      continue;
    }
    const single = validateParam(key, param, value);
    if (!single.ok) return single;
  }
  return { ok: true };
}
