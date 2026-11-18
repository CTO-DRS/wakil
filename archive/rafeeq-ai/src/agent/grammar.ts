// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * GBNF grammar generation for llama.rn's grammar-based sampling.
 *
 * Small models drift out of JSON exactly when they must invent structure, so
 * the structure is never left to the model: the loop forces every tool call
 * and the plan itself through a generated grammar, making malformed calls
 * impossible at the sampler level. The grammar subset is intentionally
 * minimal — string / number / integer / boolean / enum / arrays — matching
 * the schema subset the tools declare (schema.ts is the validation backstop).
 *
 * Strings disallow quotes and backslashes inside them (no escapes): Arabic
 * tool arguments never need them, and removing the escape machinery removes
 * the single most common corruption small models produce.
 */

import type { ToolDefinition, ToolParam, ToolSchema } from './types';

const WS = 'ws ::= [ \\t\\n\\r]*';
/** Free JSON string: no quotes, no backslashes, no control characters inside. */
const STR = 'str ::= "\\"" [^"\\\\\\x00-\\x1F]* "\\""';
const NUM = 'num ::= "-"? [0-9]+ ("." [0-9]+)?';
const INT = 'int ::= "-"? [0-9]+';

/**
 * A GBNF literal matching a JSON string whose content is exactly `value`
 * (keys and string values are quoted in the JSON the model must emit, so the
 * matched text includes the surrounding quote characters).
 */
function jsonLiteral(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"\\\"${escaped}\\\""`;
}

function paramRule(param: ToolParam): string {
  if (param.enum) {
    return `(${param.enum.map(jsonLiteral).join(' | ')})`;
  }
  switch (param.type) {
    case 'string':
      return 'str';
    case 'number':
      return 'num';
    case 'integer':
      return 'int';
    case 'boolean':
      return '("true" | "false")';
    default:
      return 'str';
  }
}

function arrayRule(param: ToolParam): string {
  const element = paramRule(param.items ?? { type: 'string', description: '' });
  return `arr ::= "[" ws ( ${element} ws ( "," ws ${element} ws )* )? "]"`;
}

/**
 * Builds the `args` rule for one tool: required properties are locked in
 * order, optional properties may each appear once after them.
 */
function argsRule(schema: ToolSchema): string {
  const required = schema.required
    .filter((name) => schema.properties[name])
    .map((name) => `${jsonLiteral(name)} ws ":" ws ${paramRule(schema.properties[name])}`);
  const optionals = Object.keys(schema.properties)
    .filter((name) => !schema.required.includes(name))
    .map((name) => `ws ( "," ws ${jsonLiteral(name)} ws ":" ws ${paramRule(schema.properties[name])} )?`);

  if (required.length === 0 && optionals.length === 0) {
    return 'args ::= "{" ws "}"';
  }
  const body = [required.join(' ws "," ws '), ...optionals].filter((part) => part.length > 0).join('');
  return `args ::= "{" ws ${body} ws "}"`;
}

/**
 * Grammar for one tool-call envelope with the tool choice still open:
 * `{"tool": <one of the tools>, "arguments": <that tool's schema>}`.
 */
export function buildToolCallGrammar(tools: readonly ToolDefinition[]): string {
  if (tools.length === 0) throw new Error('NO_TOOLS_FOR_GRAMMAR');
  const alternatives = tools
    .map((t) => `( ${jsonLiteral(t.name)} ws "," ws ${jsonLiteral('arguments')} ws ":" ws ${argsRule(t.parameters)} )`)
    .join(' | ');
  return [
    WS,
    STR,
    NUM,
    INT,
    'arr ::= "[" ws ( str ws ( "," ws str ws )* )? "]"',
    `root ::= ws "{" ws ${jsonLiteral('tool')} ws ":" ws ${alternatives} ws "}" ws`,
  ].join('\n');
}

/**
 * Grammar for a single-tool envelope — used per executed step, where the
 * chosen tool is already fixed. The strictest shape we can ask of a small
 * model: only the argument values are open.
 */
export function buildSingleToolCallGrammar(tool: ToolDefinition): string {
  const lines = [WS, STR, NUM, INT];
  const arrayParams = Object.entries(tool.parameters.properties).filter(([, p]) => !!p.items);
  // Array parameters need their element-typed arr rule; declare one per shape.
  for (const [, p] of arrayParams) {
    lines.push(arrayRule(p));
  }
  lines.push(argsRule(tool.parameters));
  lines.push(
    `root ::= ws "{" ws ${jsonLiteral('tool')} ws ":" ws ${jsonLiteral(tool.name)} ws "," ws ${jsonLiteral(
      'arguments',
    )} ws ":" ws args ws "}" ws`,
  );
  return lines.join('\n');
}

/**
 * Grammar for the plan itself: `{"steps": [{"title", "tool", "detail"}, ...]}`
 * where `tool` is one of the registry names or null (compose the answer).
 * The step count cap is enforced at parse time (planner.parsePlan).
 */
export function buildPlanGrammar(toolNames: readonly string[]): string {
  if (toolNames.length === 0) throw new Error('NO_TOOLS_FOR_GRAMMAR');
  const toolAlt = toolNames.map(jsonLiteral).join(' | ');
  const step =
    'step ::= "{" ws ' +
    `${jsonLiteral('title')} ws ":" ws str ws "," ws ` +
    `${jsonLiteral('tool')} ws ":" ws ( ${toolAlt} | "null" ) ws "," ws ` +
    `${jsonLiteral('detail')} ws ":" ws str ws "}" ws`;
  return [
    WS,
    STR,
    step,
    'steps ::= step ( ws "," ws step )*',
    `root ::= ws "{" ws ${jsonLiteral('steps')} ws ":" ws "[" ws steps? ws "]" ws "}" ws`,
  ].join('\n');
}
