// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The confirmation policy: the single place that decides which tool calls need
 * an explicit user approval card before they run.
 *
 * Competition rule (data protection): every action that CHANGES something —
 * create, update, delete, send, schedule — is mutating and must wait for an
 * explicit confirmation; read-only actions run directly.
 */

import type { ToolDefinition } from './types';

export type ToolRisk = 'read-only' | 'mutating';

export function riskLevel(tool: ToolDefinition): ToolRisk {
  return tool.mutating ? 'mutating' : 'read-only';
}

/** True when the loop must stop and show a confirmation card before running. */
export function requiresConfirmation(tool: ToolDefinition): boolean {
  return riskLevel(tool) === 'mutating';
}
