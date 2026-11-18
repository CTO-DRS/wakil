// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The thirteen onboarding goals. Each goal carries bilingual display labels and
 * the glyph name rendered by `CategoryGlyph` in `components/LibraryIcons` (new
 * glyphs were added there for the goals that had no fitting category icon).
 * The list order is the display order on the goals screen; the ids are stable
 * contract values stored in the profile store — never rename one.
 */

export type GoalId =
  | 'coding'
  | 'chat'
  | 'learning'
  | 'image'
  | 'video'
  | 'writing'
  | 'documents'
  | 'data'
  | 'productivity'
  | 'apps'
  | 'security'
  | 'multi'
  | 'free';

export type Goal = {
  readonly id: GoalId;
  /** Glyph name understood by CategoryGlyph. */
  readonly icon: string;
  readonly ar: string;
  readonly en: string;
};

export const GOALS: readonly Goal[] = [
  { id: 'coding', icon: 'code', ar: 'البرمجة وتطوير البرمجيات', en: 'Coding & software development' },
  { id: 'chat', icon: 'chat', ar: 'الدردشة والمحادثات الذكية', en: 'Smart conversations' },
  { id: 'learning', icon: 'book', ar: 'التعلم والتعليم والبحث', en: 'Learning, teaching & research' },
  { id: 'image', icon: 'image', ar: 'إنشاء الصور والتصميم', en: 'Image creation & design' },
  { id: 'video', icon: 'video', ar: 'إنشاء الفيديو والمحتوى المرئي', en: 'Video & visual content' },
  { id: 'writing', icon: 'wand', ar: 'الكتابة وصناعة المحتوى', en: 'Writing & content creation' },
  { id: 'documents', icon: 'doc', ar: 'تحليل الملفات والمستندات', en: 'Files & document analysis' },
  { id: 'data', icon: 'chart', ar: 'تحليل البيانات وحل المشكلات', en: 'Data analysis & problem solving' },
  { id: 'productivity', icon: 'bolt', ar: 'المساعدة الشخصية والإنتاجية', en: 'Personal assistance & productivity' },
  { id: 'apps', icon: 'layers', ar: 'تطوير التطبيقات والمواقع', en: 'App & web development' },
  { id: 'security', icon: 'shield', ar: 'الأمن السيبراني والأمن الدفاعي', en: 'Cybersecurity & defense' },
  { id: 'multi', icon: 'grid', ar: 'استخدامات متعددة', en: 'Multiple uses' },
  { id: 'free', icon: 'spark', ar: 'استخدام حر دون تحديد هدف', en: 'Free use, no fixed goal' },
];

const BY_ID = new Map<string, Goal>(GOALS.map((g) => [g.id, g]));

export function goalById(id: string | null | undefined): Goal | null {
  return BY_ID.get(id ?? '') ?? null;
}

/** Dedupes a user selection and keeps only known ids, preserving tap order. */
export function normalizeGoals(value: unknown): GoalId[] {
  if (!Array.isArray(value)) return [];
  const out: GoalId[] = [];
  for (const v of value) {
    const g = BY_ID.get(typeof v === 'string' ? v : '');
    if (g && !out.includes(g.id)) out.push(g.id);
  }
  // «Free use» is mutually exclusive with everything else: choosing it alone
  // keeps the profile honest about having no concrete goal.
  return out.includes('free') && out.length > 1 ? out.filter((g) => g !== 'free') : out;
}

/** Goals that ask for deeper reasoning models (drives the conditional question). */
export const REASONING_GOALS: readonly GoalId[] = ['coding', 'apps', 'data', 'security', 'learning', 'documents'];

/** True when at least one selected goal benefits from the strongest local model. */
export function wantsReasoning(goals: readonly GoalId[]): boolean {
  return goals.some((g) => REASONING_GOALS.includes(g));
}
