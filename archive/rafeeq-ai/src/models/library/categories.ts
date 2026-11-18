// Copyright (c) 2026 DRS AI. All rights reserved.
import type { LibraryCategory, LibraryCategoryId } from './types';

/**
 * The twelve fixed categories, in display order. Adding a category later means
 * appending here and adding models to data.ts — the screens render whatever
 * the registry exposes, so the UI never needs rebuilding.
 */
export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  {
    id: 'chat',
    icon: 'chat',
    name: { ar: 'المحادثة والنصوص', en: 'Text & chat' },
    desc: { ar: 'النماذج اللغوية الصغيرة التي تعمل في راحة يدك.', en: 'The small language models that run in your palm.' },
  },
  {
    id: 'stt',
    icon: 'mic',
    name: { ar: 'الصوت إلى نص', en: 'Speech-to-text' },
    desc: { ar: 'تفريغ الصوت — واللهجات مشمولة.', en: 'Voice transcription — dialects included.' },
  },
  {
    id: 'tts',
    icon: 'speaker',
    name: { ar: 'النص إلى صوت', en: 'Text-to-speech' },
    desc: { ar: 'ردود منطوقة طبيعية بأصوات تعمل دون اتصال.', en: 'Natural spoken replies with offline voices.' },
  },
  {
    id: 'image',
    icon: 'image',
    name: { ar: 'توليد الصور', en: 'Image generation' },
    desc: { ar: 'نماذج النص إلى صورة وما تفعله فعلاً.', en: 'Text-to-image models and what each can really do.' },
  },
  {
    id: 'video',
    icon: 'video',
    name: { ar: 'توليد الفيديو', en: 'Video generation' },
    desc: { ar: 'نماذج النص والصورة إلى فيديو، موثَّقة بأمانة.', en: 'Text- and image-to-video models, documented honestly.' },
  },
  {
    id: 'audio',
    icon: 'wave',
    name: { ar: 'توليد الصوت', en: 'Audio generation' },
    desc: { ar: 'موسيقى وأجواء ومؤثرات صوتية من وصف.', en: 'Music, ambience and sound effects from a prompt.' },
  },
  {
    id: 'imageEdit',
    icon: 'wand',
    name: { ar: 'تعديل الصور', en: 'Image editing' },
    desc: { ar: 'إكمال الأجزاء الناقصة والموازدة وإعادة التنسيق.', en: 'Inpainting, upscaling and restyling.' },
  },
  {
    id: 'imageUnderstand',
    icon: 'eye',
    name: { ar: 'فهم الصور', en: 'Image understanding' },
    desc: { ar: 'نماذج الرؤية واللغة التي تقرأ الصور.', en: 'Vision-language models that read pictures.' },
  },
  {
    id: 'coding',
    icon: 'code',
    name: { ar: 'البرمجة', en: 'Coding' },
    desc: { ar: 'نماذج الإكمال والاستدلال للشيفرات.', en: 'Completion and reasoning models for code.' },
  },
  {
    id: 'threeD',
    icon: 'cube',
    name: { ar: 'توليد المجسمات', en: '3D generation' },
    desc: { ar: 'من الصور والنص إلى مجسمات ثلاثية الأبعاد.', en: 'Images and text into 3D meshes.' },
  },
  {
    id: 'translation',
    icon: 'globe',
    name: { ar: 'الترجمة', en: 'Translation' },
    desc: { ar: 'ترجمة متعددة اللغات والعربية مشمولة.', en: 'Multilingual translation, Arabic included.' },
  },
  {
    id: 'research',
    icon: 'flask',
    name: { ar: 'البحث والاسترجاع', en: 'Research & retrieval' },
    desc: { ar: 'نماذج استدلال وتضمين لاسترجاع بلا إنترنت.', en: 'Reasoners and embeddings for offline RAG.' },
  },
];

const BY_ID = new Map<string, LibraryCategory>(LIBRARY_CATEGORIES.map((c) => [c.id, c]));

export function libraryCategory(id: LibraryCategoryId | string): LibraryCategory | null {
  return BY_ID.get(id) ?? null;
}

export const LIBRARY_CATEGORY_IDS: readonly LibraryCategoryId[] = LIBRARY_CATEGORIES.map((c) => c.id);
