// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The tool registry: every capability the agent can call, validated at
 * registration time and rendered into a compact catalog the small model can
 * read inside its prompt.
 */

import type { Language } from '../types';
import type { ToolDefinition } from './types';

const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Registers a tool; throws on duplicates or malformed names. */
  register(def: ToolDefinition): this {
    if (!NAME_RE.test(def.name)) {
      throw new Error(`INVALID_TOOL_NAME: ${def.name}`);
    }
    if (this.tools.has(def.name)) {
      throw new Error(`DUPLICATE_TOOL: ${def.name}`);
    }
    this.tools.set(def.name, def);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Every registered tool, sorted by name (stable catalog across prompts). */
  list(): ToolDefinition[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The prompt-facing catalog text in the requested language. */
  catalog(locale: Language): string {
    return renderToolCatalog(this.list(), locale);
  }

  get size(): number {
    return this.tools.size;
  }
}

function paramSummary(def: ToolDefinition): string {
  const parts: string[] = [];
  for (const name of def.parameters.required) {
    const p = def.parameters.properties[name];
    if (!p) continue;
    const kind = p.enum ? p.enum.join('/') : p.type;
    parts.push(`${name}: ${kind}*`);
  }
  for (const [name, p] of Object.entries(def.parameters.properties)) {
    if (def.parameters.required.includes(name)) continue;
    const kind = p.enum ? p.enum.join('/') : p.type;
    parts.push(`${name}: ${kind}`);
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

/**
 * One line per tool: name, mutating badge, description and its parameter list
 * (`*` marks required). Kept dense on purpose — small models lose focus with
 * verbose catalogs.
 */
export function renderToolCatalog(tools: readonly ToolDefinition[], locale: Language): string {
  if (tools.length === 0) return locale === 'ar' ? '(لا توجد أدوات)' : '(no tools)';
  return tools
    .map((t) => {
      // Normalize the trailing period so the line never renders "..".
      const desc = (locale === 'ar' ? t.descriptionAr : t.descriptionEn).replace(/[.]+$/, '');
      const badge = t.mutating ? (locale === 'ar' ? '[يغيّر بيانات]' : '[mutating]') : '[read-only]';
      return `- ${t.name} ${badge} — ${desc}. ${locale === 'ar' ? 'المدخلات' : 'Args'}: ${paramSummary(t)}`;
    })
    .join('\n');
}
