// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The model library's entries. Every row is a real, publicly documented model:
 * names, developers, licenses and parameters come from the official pages
 * (Hugging Face model cards or the developer's repository), spot-verified on
 * 2026-11-10. Nothing here is invented:
 *
 *  - `availability: 'integrated'` entries map 1:1 to downloadable ids in
 *    `../catalog` (or the built-in TTS engine) — the detail screen turns them
 *    into real actions through the existing model/voice stores.
 *  - `availability: 'catalog'` entries are documentation only. No run button,
 *    no fake download, no invented prices: `cost` states what the license
 *    actually implies, and anything uncertain stays null.
 *
 * Exact byte sizes appear only on integrated entries, copied from the same
 * catalog the downloader uses (integrity-checked by tests).
 */

import type { LibraryModel } from './types';

export const LIBRARY_MODELS: readonly LibraryModel[] = [
  // ------------------------------------------------------------------ chat
  {
    id: 'lib.chat.qwen25-05b',
    categoryId: 'chat',
    name: 'Qwen2.5 0.5B Instruct',
    developer: 'Alibaba Qwen',
    license: 'Apache-2.0',
    availability: 'integrated',
    integratedRef: 'qwen2.5-0.5b-instruct-q4_k_m',
    kind: 'llm',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    params: '0.5B',
    quant: 'Q4_K_M',
    sizeBytes: 491400032,
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'أصغر نموذج في القائمة — يعمل على معظم الهواتف الحديثة، ويتحقق التطبيق من الذاكرة الحرة قبل التحميل.',
      en: 'The smallest model here — runs on most recent phones; the app checks free RAM before loading.',
    },
    quality: {
      ar: 'إجابات سريعة للمهام اليومية القصيرة؛ الدقة اللغوية محدودة بحجمه الصغير.',
      en: 'Fast answers for short everyday tasks; language accuracy is limited by the small size.',
    },
    limits: {
      ar: 'سياق افتراضي 2048 رمزاً داخل رفيق؛ ضعيف في الاستدلال الطويل والرياضيات المعقدة.',
      en: '2048-token default context inside Rafeeq; weak on long reasoning and complex math.',
    },
    cost: {
      ar: 'مجاني — أوزان مفتوحة برخصة Apache-2.0 وتعمل كلياً على جهازك.',
      en: 'Free — open weights under Apache-2.0, running entirely on your device.',
    },
    desc: {
      ar: 'نسخة القرار السريع من عائلة Qwen2.5، مضغوطة Q4_K_M لتعمل دون إنترنت داخل رفيق.',
      en: 'The fast-response member of Qwen2.5, Q4_K_M-quantized to run offline inside Rafeeq.',
    },
    features: {
      ar: ['تحميل كامل دون إنترنت', 'استهلاك ذاكرة منخفض جداً', 'زمن استجابة سريع', 'ثنائي اللغة (عربي/إنجليزي) بحسب التدريب'],
      en: ['Fully offline', 'Very low memory footprint', 'Fast response times', 'Bilingual output (Arabic/English) within training limits'],
    },
    tags: ['qwen', 'qwen2.5', 'chat', 'llm', 'عربي', 'محادثة', 'صغير'],
  },
  {
    id: 'lib.chat.qwen25-15b',
    categoryId: 'chat',
    name: 'Qwen2.5 1.5B Instruct',
    developer: 'Alibaba Qwen',
    license: 'Apache-2.0',
    availability: 'integrated',
    integratedRef: 'qwen2.5-1.5b-instruct-q4_k_m',
    kind: 'llm',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    params: '1.5B',
    quant: 'Q4_K_M',
    sizeBytes: 1117320736,
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'ذاكرة أكبر من نسخة 0.5B — مناسبة للهواتف الحديثة، مع تحقق تلقائي قبل التحميل.',
      en: 'More RAM than the 0.5B — suited to recent phones, with an automatic pre-load check.',
    },
    quality: {
      ar: 'خطوة دقة واضحة فوق 0.5B في العربية والإنجليزية مع بقائه سريعاً.',
      en: 'A clear accuracy step above the 0.5B in Arabic and English while staying fast.',
    },
    limits: {
      ar: 'سياق افتراضي 2048 رمزاً؛ أبطأ نسبياً من 0.5B على الأجهزة المتواضعة.',
      en: '2048-token default context; relatively slower than 0.5B on modest hardware.',
    },
    cost: {
      ar: 'مجاني — أوزان مفتوحة برخصة Apache-2.0 وتعمل كلياً على جهازك.',
      en: 'Free — open weights under Apache-2.0, running entirely on your device.',
    },
    desc: {
      ar: 'التوازن المفضل بين الدقة والسرعة في عائلة Qwen2.5 داخل رفيق.',
      en: 'The preferred balance of accuracy and speed in the Qwen2.5 family inside Rafeeq.',
    },
    features: {
      ar: ['جودة عربية أفضل', 'تحميل كامل دون إنترنت', 'خيار افتراضي جيد للمحادثة اليومية'],
      en: ['Better Arabic quality', 'Fully offline', 'Good default for daily chat'],
    },
    tags: ['qwen', 'qwen2.5', 'chat', 'llm', 'عربي', 'محادثة'],
  },
  {
    id: 'lib.chat.llama32-1b',
    categoryId: 'chat',
    name: 'Llama 3.2 1B Instruct',
    developer: 'Meta',
    license: 'Llama 3.2 Community License',
    availability: 'integrated',
    integratedRef: 'llama-3.2-1b-instruct-q4_k_m',
    kind: 'llm',
    url: 'https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct',
    params: '1B',
    quant: 'Q4_K_M',
    sizeBytes: 807694464,
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'يعمل على الهواتف الحديثة؛ ترخيص ميتا يفرض شروطاً على إعادة التوزيع.',
      en: 'Runs on recent phones; Meta license adds redistribution conditions.',
    },
    quality: {
      ar: 'قوي في الإنجليزية والمهام العامة؛ العربية أدنى من Qwen بنفس الحجم.',
      en: 'Strong in English and general tasks; Arabic trails Qwen at the same size.',
    },
    limits: {
      ar: 'ترخيص المجتمع يقيّد بعض الاستخدامات؛ راجع بطاقة النموذج الرسمية.',
      en: 'The community license restricts some uses; see the official model card.',
    },
    cost: {
      ar: 'مجاني ضمن شروط Llama 3.2 Community License.',
      en: 'Free within the terms of the Llama 3.2 Community License.',
    },
    desc: {
      ar: 'نموذج ميتا الخفيف من عائلة Llama 3.2 المضغوط للعمل دون إنترنت.',
      en: 'Meta’s light Llama 3.2 model, quantized for offline use.',
    },
    features: {
      ar: ['تحميل كامل دون إنترنت', 'شعبية واسعة وأدوات دعم كثيرة', 'إجابات متماسكة للمهام العامة'],
      en: ['Fully offline', 'Broad ecosystem support', 'Coherent general-purpose answers'],
    },
    tags: ['llama', 'meta', 'chat', 'llm', 'محادثة'],
  },
  {
    id: 'lib.chat.gemma3-1b',
    categoryId: 'chat',
    name: 'Gemma 3 1B IT',
    developer: 'Google',
    license: 'Gemma Terms of Use',
    availability: 'integrated',
    integratedRef: 'gemma-3-1b-it-q4_k_m',
    kind: 'llm',
    url: 'https://huggingface.co/google/gemma-3-1b-it',
    params: '1B',
    quant: 'Q4_K_M',
    sizeBytes: 806058496,
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'يعمل على الهواتف الحديثة؛ رخصة جوجل تشترط الالتزام بشروط الاستخدام.',
      en: 'Runs on recent phones; Google’s terms of use apply.',
    },
    quality: {
      ar: 'جودة لغوية جيدة لحجمه مع دعم متعدد اللغات من تدريب جوجل.',
      en: 'Good language quality for its size with Google’s multilingual training.',
    },
    limits: {
      ar: 'شروط Gemma تفرض قيود استخدام؛ راجع البطاقة الرسمية قبل أي نشر.',
      en: 'Gemma terms impose usage restrictions; review the official card before redistribution.',
    },
    cost: {
      ar: 'مجاني ضمن Gemma Terms of Use.',
      en: 'Free under the Gemma Terms of Use.',
    },
    desc: {
      ar: 'نموذج جوجل الخفيف من عائلة Gemma 3 المضغوط للعمل دون إنترنت.',
      en: 'Google’s light Gemma 3 model, quantized for offline use.',
    },
    features: {
      ar: ['تحميل كامل دون إنترنت', 'تدريب جوجل متعدد اللغات', 'استهلاك معقول للبطارية'],
      en: ['Fully offline', 'Google multilingual training', 'Reasonable battery use'],
    },
    tags: ['gemma', 'google', 'chat', 'llm', 'محادثة'],
  },
  {
    id: 'lib.chat.allam-7b',
    categoryId: 'chat',
    name: 'ALLaM 7B Instruct (preview)',
    developer: 'SDAIA / NCAI (السعودية)',
    license: null,
    availability: 'catalog',
    url: 'https://huggingface.co/ALLaM-AI/ALLaM-7B-Instruct-preview',
    params: '7B',
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'بحجم 7B يحتاج ذاكرة كبيرة وتشغيلاً بخادم أو كمبيوتر — لا يعمل على الهاتف بجودته الكاملة.',
      en: 'At 7B it needs substantial memory and a server/desktop-class runtime — not phone-ready at full quality.',
    },
    quality: {
      ar: 'مدرّب من الصفر على عربي وإنجليزي (5.2 تريليون رمز) مع تقييمات عربية منشورة قوية لفئته.',
      en: 'Trained from scratch on Arabic and English (5.2T tokens) with strong published Arabic evaluations for its class.',
    },
    limits: {
      ar: 'سياق 4096 رمزاً؛ نسخة معاينة (preview)؛ راجع ملف الترخيص في الصفحة الرسمية قبل أي استخدام.',
      en: '4096-token context; preview release; check the LICENSE file on the official page before use.',
    },
    cost: {
      ar: 'الأوزان منشورة للتحميل من Hugging Face؛ شروط الترخيص في ملف LICENSE بصفحة النموذج.',
      en: 'Weights are published on Hugging Face; license terms live in the LICENSE file on the model page.',
    },
    desc: {
      ar: 'النموذج السعودي من الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)، متخصص في التكنولوجيا العربية.',
      en: 'The Saudi model from the Saudi Data & AI Authority (SDAIA), built for Arabic language technology.',
    },
    features: {
      ar: ['تدريب عربي أصيل من سدايا', 'ثنائي اللغة عربي/إنجليزي', 'تقييمات عربية منشورة (ETEC، IEN، Arabic MMLU)'],
      en: ['Native Arabic training by SDAIA', 'Bilingual Arabic/English', 'Published Arabic benchmarks (ETEC, IEN, Arabic MMLU)'],
    },
    tags: ['allam', 'sdaiia', 'سدايا', 'عربي', 'arabic', 'saudi', 'chat'],
  },
  {
    id: 'lib.chat.phi35-mini',
    categoryId: 'chat',
    name: 'Phi-3.5-mini-instruct',
    developer: 'Microsoft',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct',
    params: '3.8B',
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'يحتاج أجهزة قوية أو تشغيلاً مكمماً خارج رفيق؛ لا يعمل داخل التطبيق حالياً.',
      en: 'Needs stronger hardware or external quantized runtimes; not runnable inside Rafeeq yet.',
    },
    quality: {
      ar: 'كفاءة مرجعية في فئته بفضل بيانات تدريب مختارة بعناية.',
      en: 'Reference-class efficiency for its size thanks to carefully curated training data.',
    },
    limits: {
      ar: 'ركز التدريب على الإنجليزية؛ الأداء العربي أقل من نماذج عربية متخصصة.',
      en: 'Training is English-centric; Arabic performance trails specialized Arabic models.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT المفتوحة.',
      en: 'Free — open MIT license.',
    },
    desc: {
      ar: 'نموذج مايكروسوفت الخفيف عالي الكفاءة من عائلة Phi.',
      en: 'Microsoft’s efficient lightweight model from the Phi family.',
    },
    features: {
      ar: ['رخصة MIT متساهلة', 'كفاءة عالية لكل معامل', 'سياق طويل في النسخ الأصلية'],
      en: ['Permissive MIT license', 'High per-parameter efficiency', 'Long context in the original release'],
    },
    tags: ['phi', 'microsoft', 'llm', 'chat'],
  },
  {
    id: 'lib.chat.smollm2-17b',
    categoryId: 'chat',
    name: 'SmolLM2 1.7B Instruct',
    developer: 'Hugging Face',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct',
    params: '1.7B',
    io: { in: 'نص · Text', out: 'نص · Text' },
    requirements: {
      ar: 'صالح نظرياً للأجهزة المحمولة عبر llama.cpp لكنه غير مدمج في رفيق بعد.',
      en: 'Theoretically phone-viable via llama.cpp but not integrated into Rafeeq yet.',
    },
    quality: {
      ar: 'مصمم للأجهزة الصغيرة بجودة متماسكة في الإنجليزية.',
      en: 'Built for small devices with coherent English-language quality.',
    },
    limits: {
      ar: 'تدريب إنجليزي في الأساس؛ العربية غير الأولوية.',
      en: 'Primarily English training; Arabic is not a priority.',
    },
    cost: {
      ar: 'مجاني — أوزان مفتوحة برخصة Apache-2.0.',
      en: 'Free — open weights under Apache-2.0.',
    },
    desc: {
      ar: 'عائلة Hugging Face الصغيرة المصممة خصيصاً للتشغيل على الأجهزة المحدودة.',
      en: 'Hugging Face’s small family designed specifically for constrained devices.',
    },
    features: {
      ar: ['مصمم للأجهزة الصغيرة', 'رخصة Apache-2.0', 'ثلاثة أحجام (135M/360M/1.7B)'],
      en: ['Designed for small devices', 'Apache-2.0 license', 'Three sizes (135M/360M/1.7B)'],
    },
    tags: ['smollm', 'huggingface', 'llm', 'edge'],
  },

  // ------------------------------------------------------------------- stt
  {
    id: 'lib.stt.whisper-tiny',
    categoryId: 'stt',
    name: 'Whisper Tiny',
    developer: 'OpenAI',
    license: 'MIT',
    availability: 'integrated',
    integratedRef: 'whisper-tiny',
    kind: 'voice',
    url: 'https://huggingface.co/openai/whisper-tiny',
    params: '39M',
    quant: 'F16',
    sizeBytes: 77691713,
    io: { in: 'صوت · Audio', out: 'نص · Text' },
    requirements: {
      ar: 'أخف خيار تفريغ في رفيق — سريع على أي هاتف حديث ويستهلك طاقة قليلة.',
      en: 'The lightest transcription option in Rafeeq — fast on any recent phone with low power use.',
    },
    quality: {
      ar: 'دقة مقبولة للإملاء القصير؛ العربية واللهجات أفضل مع نموذج أكبر.',
      en: 'Acceptable accuracy for short dictation; Arabic and dialects improve with a bigger model.',
    },
    limits: {
      ar: 'دقة أقل في الضجيج واللهجات القوية مقارنة بـ Small وLarge.',
      en: 'Lower accuracy on noise and strong dialects than Small/Large.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT وتعمل كلياً على جهازك.',
      en: 'Free — MIT licensed, running entirely on your device.',
    },
    desc: {
      ar: 'النسخة المصغرة من Whisper بصيغة ggml، هي الافتراضي لزمن الاستجابة في رفيق.',
      en: 'Whisper’s tiny build in ggml form — the latency default in Rafeeq.',
    },
    features: {
      ar: ['تفريغ كامل دون إنترنت', 'زمن استجابة الأدنى', 'حجم تنزيل صغير (≈74MB)'],
      en: ['Fully offline transcription', 'Lowest latency', 'Small download (≈74MB)'],
    },
    tags: ['whisper', 'stt', 'voice', 'صوت', 'تفريغ'],
  },
  {
    id: 'lib.stt.whisper-small',
    categoryId: 'stt',
    name: 'Whisper Small',
    developer: 'OpenAI',
    license: 'MIT',
    availability: 'integrated',
    integratedRef: 'whisper-small',
    kind: 'voice',
    url: 'https://huggingface.co/openai/whisper-small',
    params: '244M',
    quant: 'F16',
    sizeBytes: 487601967,
    io: { in: 'صوت · Audio', out: 'نص · Text' },
    requirements: {
      ar: 'ذاكرة وحجم تنزيل أكبر من Tiny (≈465MB) مع تحقق تلقائي قبل الاستخدام.',
      en: 'More RAM and download than Tiny (≈465MB) with an automatic pre-use check.',
    },
    quality: {
      ar: 'قفزة دقة واضحة على Tiny خصوصاً بالعربية — الخيار المتوازن في رفيق.',
      en: 'A clear accuracy jump over Tiny, especially in Arabic — the balanced pick in Rafeeq.',
    },
    limits: {
      ar: 'أبطأ من Tiny على الأجهزة المتواضعة.',
      en: 'Slower than Tiny on modest hardware.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT وتعمل كلياً على جهازك.',
      en: 'Free — MIT licensed, running entirely on your device.',
    },
    desc: {
      ar: 'النسخة الصغيرة من Whisper بصيغة ggml — خيار الدقة الأعلى المتاح للتنزيل داخل رفيق.',
      en: 'Whisper’s small build in ggml — the highest-accuracy downloadable option inside Rafeeq.',
    },
    features: {
      ar: ['تفريغ كامل دون إنترنت', 'دقة أعلى بالعربية', 'مقاومة أفضل للضجيج'],
      en: ['Fully offline transcription', 'Higher Arabic accuracy', 'Better noise robustness'],
    },
    tags: ['whisper', 'stt', 'voice', 'صوت', 'تفريغ', 'عربي'],
  },
  {
    id: 'lib.stt.whisper-large-v3',
    categoryId: 'stt',
    name: 'Whisper Large v3',
    developer: 'OpenAI',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/openai/whisper-large-v3',
    params: '1.5B',
    io: { in: 'صوت · Audio', out: 'نص · Text' },
    requirements: {
      ar: 'أكبر بكثير من قدرة الهاتف المتوسطة — يحتاج تشغيلاً على خادم أو كمبيوتر.',
      en: 'Far beyond typical phone capacity — needs a server or desktop-class runtime.',
    },
    quality: {
      ar: 'أعلى دقة في عائلة Whisper والأقوى بالعربية الفصحى واللهجات.',
      en: 'The most accurate Whisper and the strongest on Arabic and its dialects.',
    },
    limits: {
      ar: 'لا يعمل داخل رفيق بعد؛ الحجم والذاكرة يفوقان هواتف الفئة المتوسطة.',
      en: 'Not runnable inside Rafeeq yet; size and memory exceed mid-range phones.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'قمة عائلة Whisper للتفريغ — المرجع الذي تُقاس عليه النسخ الصغيرة.',
      en: 'The top of the Whisper family — the reference the smaller builds are measured against.',
    },
    features: {
      ar: ['أعلى دقة في العائلة', 'مئات اللغات', 'أداء قوي بالعربية'],
      en: ['Highest family accuracy', 'Hundreds of languages', 'Strong Arabic performance'],
    },
    tags: ['whisper', 'stt', 'large', 'صوت', 'تفريغ', 'عربي'],
  },
  {
    id: 'lib.stt.oddadmix-saudi',
    categoryId: 'stt',
    name: 'Whisper Small — Saudi Dialect (fine-tune)',
    developer: 'oddadmix',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/oddadmix/whisper-small-arabic-dialectal-v2',
    params: '244M',
    io: { in: 'صوت · Audio', out: 'نص · Text' },
    requirements: {
      ar: 'بصيغة whisper.cpp ggml يعمل بحجم Whisper Small نفسه — يستورد محلياً داخل رفيق (انظر docs/phase4-voice.md).',
      en: 'In whisper.cpp ggml form it runs like Whisper Small itself — importable locally into Rafeeq (see docs/phase4-voice.md).',
    },
    quality: {
      ar: 'ضبط دقيق على العربية اللهجية — أداء أفضل من Whisper الأصلي على اللهجات الخليجية.',
      en: 'Fine-tuned on dialectal Arabic — beats stock Whisper on Gulf dialects.',
    },
    limits: {
      ar: 'يستورد كملف محلي بدل التنزيل المباشر داخل التطبيق.',
      en: 'Imported as a local file rather than downloaded in-app.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'ضبط دقيق لـ Whisper Small على العربية اللهجية (منها السعودية) — مدعوم للاستيراد المحلي في رفيق.',
      en: 'A Whisper Small fine-tune for dialectal Arabic (Saudi included) — supported for local import in Rafeeq.',
    },
    features: {
      ar: ['متخصص باللهجات العربية', 'يعمل دون إنترنت عبر الاستيراد المحلي', 'نفس متطلبات Whisper Small'],
      en: ['Specialized in Arabic dialects', 'Offline via local import', 'Same footprint as Whisper Small'],
    },
    tags: ['whisper', 'stt', 'saudi', 'سعودي', 'لهجة', 'عربي', 'خليجي'],
  },

  // ------------------------------------------------------------------- tts
  {
    id: 'lib.tts.rafeeq-builtin',
    categoryId: 'tts',
    name: 'Rafeeq Built-in Voice',
    developer: 'Rafeeq AI',
    license: null,
    availability: 'integrated',
    kind: 'builtin',
    url: 'https://github.com/CTO-DRS/rafeeq-ai',
    io: { in: 'نص · Text', out: 'صوت · Speech' },
    requirements: {
      ar: 'مدمج في التطبيق نفسه — بلا تنزيل إضافي وبلا إذن شبكة.',
      en: 'Built into the app — no extra download, no network permission.',
    },
    quality: {
      ar: 'صوت عربي سعودي طبيعي يُقرأ به رد رافيق دون إنترنت.',
      en: 'A natural Saudi Arabic voice that reads Rafeeq’s replies offline.',
    },
    limits: {
      ar: 'صوت واحد مدمج؛ تنويع الأصوات يحتاج نموذج TTS خارجي.',
      en: 'One built-in voice; more voices need an external TTS model.',
    },
    cost: {
      ar: 'مجاني — جزء من التطبيق.',
      en: 'Free — part of the app.',
    },
    desc: {
      ar: 'محرك النطق المدمج في رفيق: يقرأ الردود بالعربية دون اتصال وبلا أي خدمة سحابية.',
      en: 'Rafeeq’s built-in speech engine: reads replies in Arabic, fully offline with no cloud service.',
    },
    features: {
      ar: ['يعمل كلياً دون إنترنت', 'عربي سعودي', 'لا يحتاج أي تنزيل'],
      en: ['Fully offline', 'Saudi Arabic', 'No download needed'],
    },
    tags: ['tts', 'صوت', 'نطق', 'saudi', 'سعودي', 'عربي'],
  },
  {
    id: 'lib.tts.piper',
    categoryId: 'tts',
    name: 'Piper',
    developer: 'Rhasspy (OHF)',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://github.com/rhasspy/piper',
    params: null,
    io: { in: 'نص · Text', out: 'صوت · Speech' },
    requirements: {
      ar: 'مصمم للجهاز الواحد (Raspberry Pi فأعلى) — تكامل محتمل مستقبلاً مع رفيق.',
      en: 'Built for on-device use (Raspberry Pi and up) — a plausible future Rafeeq integration.',
    },
    quality: {
      ar: 'نطق سريع جداً على الأجهزة الضعيفة مع أصوات جاهزة لعشرات اللغات منها العربية.',
      en: 'Very fast synthesis on weak hardware with ready voices for dozens of languages, Arabic included.',
    },
    limits: {
      ar: 'جودة الصوت أدنى من الأنظمة العصبية الضخمة.',
      en: 'Voice quality below the large neural systems.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT وأصوات مفتوحة.',
      en: 'Free — MIT license with open voices.',
    },
    desc: {
      ar: 'نظام نطق عصبي سريع جداً يعمل محلياً على أجهزة ضعيفة جداً.',
      en: 'A very fast neural TTS that runs locally on very weak hardware.',
    },
    features: {
      ar: ['أداء فائق السرعة', 'أصوات عربية متاحة', 'رخصة MIT'],
      en: ['Extremely fast', 'Arabic voices available', 'MIT licensed'],
    },
    tags: ['tts', 'piper', 'صوت', 'نطق', 'عربي'],
  },
  {
    id: 'lib.tts.xtts-v2',
    categoryId: 'tts',
    name: 'XTTS-v2',
    developer: 'Coqui',
    license: 'Coqui Public Model License',
    availability: 'catalog',
    url: 'https://huggingface.co/coqui/XTTS-v2',
    params: null,
    io: { in: 'نص + عينة صوت · Text + voice sample', out: 'صوت · Speech' },
    requirements: {
      ar: 'أثقل من قدرة الهاتف المتوسطة — يحتاج خادماً أو كمبيوتراً.',
      en: 'Beyond mid-range phone capacity — needs a server or desktop.',
    },
    quality: {
      ar: 'توليد صوت طبيعي باستنساخ صوت من عينة قصيرة (6 ثوانٍ) بـ17 لغة منها العربية.',
      en: 'Natural speech with voice cloning from a short (6s) sample across 17 languages, Arabic included.',
    },
    limits: {
      ar: 'الرخصة غير تجارية؛ الاستنساخ يثير قضايا موافقة وخصوصية يجب احترامها.',
      en: 'Non-commercial license; cloning raises consent/privacy duties that must be respected.',
    },
    cost: {
      ar: 'مجاني للاستخدام غير التجاري بموجب رخصة Coqui العامة.',
      en: 'Free for non-commercial use under the Coqui Public Model License.',
    },
    desc: {
      ar: 'نظام نطق متقدم باستنساخ الأصوات من عينة قصيرة.',
      en: 'An advanced TTS cloning voices from a short sample.',
    },
    features: {
      ar: ['استنساخ صوت من 6 ثوانٍ', '17 لغة منها العربية', 'جودة طبيعية عالية'],
      en: ['6-second voice cloning', '17 languages incl. Arabic', 'High naturalness'],
    },
    tags: ['tts', 'xtts', 'coqui', 'clone', 'صوت'],
  },
  {
    id: 'lib.tts.mms-tts',
    categoryId: 'tts',
    name: 'MMS TTS',
    developer: 'Meta',
    license: 'CC-BY-NC 4.0',
    availability: 'catalog',
    url: 'https://huggingface.co/facebook/mms-tts-ara',
    params: null,
    io: { in: 'نص · Text', out: 'صوت · Speech' },
    requirements: {
      ar: 'نموذج لكل لغة (نسخة العربية mms-tts-ara) صغير نسبياً — تكامل ممكن مستقبلاً.',
      en: 'One model per language (Arabic: mms-tts-ara), relatively small — a possible future integration.',
    },
    quality: {
      ar: 'تغطية أوسع لغوياً في العالم (1,100+ لغة) بجودة متفاوتة بين اللغات.',
      en: 'The broadest language coverage anywhere (1,100+ languages) with quality that varies by language.',
    },
    limits: {
      ar: 'رخصة غير تجارية؛ الجودة بالعربية أقل من الأنظمة المخصصة.',
      en: 'Non-commercial license; Arabic quality trails dedicated systems.',
    },
    cost: {
      ar: 'مجاني للاستخدام غير التجاري — CC-BY-NC 4.0.',
      en: 'Free for non-commercial use — CC-BY-NC 4.0.',
    },
    desc: {
      ar: 'مشروع MMS من ميتا للنطق بتغطية غير مسبوقة للغات العالم.',
      en: 'Meta’s MMS project with unprecedented world-language TTS coverage.',
    },
    features: {
      ar: ['1,100+ لغة', 'نسخة عربية مخصصة', 'نماذج صغيرة لكل لغة'],
      en: ['1,100+ languages', 'Dedicated Arabic model', 'Small per-language models'],
    },
    tags: ['tts', 'mms', 'meta', 'صوت', 'عربي'],
  },

  // ----------------------------------------------------------------- image
  {
    id: 'lib.image.flux-schnell',
    categoryId: 'image',
    name: 'FLUX.1 [schnell]',
    developer: 'Black Forest Labs',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    params: '12B',
    io: { in: 'نص · Text prompt', out: 'صورة · Image' },
    requirements: {
      ar: '12 مليار معامل — يتطلب GPU سحابية أو شبه موصول؛ لا يعمل على الهاتف.',
      en: '12B parameters — needs a cloud/desktop GPU; will not run on a phone.',
    },
    quality: {
      ar: 'من أسرع وأجود مولدات الصور المفتوحة — 1–4 خطوات توليد تكفي.',
      en: 'Among the fastest, best open image generators — 1–4 generation steps suffice.',
    },
    limits: {
      ar: 'الحجم يمنع التشغيل المحمول؛ النسخة dev أقوى لكنها غير تجارية.',
      en: 'Size rules out mobile execution; the dev variant is stronger but non-commercial.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0 لنموذج schnell.',
      en: 'Free — Apache-2.0 for the schnell variant.',
    },
    desc: {
      ar: 'مولد النص-إلى-صورة السريع من مطوري FLUX، مفتوح المصدر بالكامل.',
      en: 'The fast text-to-image generator from the FLUX developers, fully open.',
    },
    features: {
      ar: ['توليد في 1–4 خطوات', 'جودة إضاءة ونصوص داخل الصورة أعلى من الجيل السابق', 'رخصة Apache-2.0'],
      en: ['1–4 step generation', 'Strong lighting and in-image text vs prior generation', 'Apache-2.0 licensed'],
    },
    tags: ['flux', 'image', 'صور', 'توليد', 'text-to-image'],
  },
  {
    id: 'lib.image.sdxl',
    categoryId: 'image',
    name: 'Stable Diffusion XL 1.0',
    developer: 'Stability AI',
    license: 'CreativeML Open RAIL++-M',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    params: '3.5B',
    io: { in: 'نص · Text prompt', out: 'صورة · Image' },
    requirements: {
      ar: 'يتطلب GPU (حتى المكمل بالموبايل يبقى تجريبياً جداً) — لا يوجد تكامل في رفيق.',
      en: 'Needs a GPU; even mobile-quantized builds remain experimental — no Rafeeq integration.',
    },
    quality: {
      ar: 'المرجع المفتوح الأشهر للصور عالية الدقة حتى 1024×1024.',
      en: 'The best-known open reference for high-resolution images up to 1024×1024.',
    },
    limits: {
      ar: 'رخصة Open RAIL++ تضع قيود استخدام مجتمعية يجب قراءتها.',
      en: 'The Open RAIL++ license adds community-use restrictions worth reading.',
    },
    cost: {
      ar: 'مجاني ضمن شروط الرخصة المجتمعية.',
      en: 'Free within the community-license terms.',
    },
    desc: {
      ar: 'الجيل الأشهر من عائلة Stable Diffusion عالي الدقة.',
      en: 'The best-known high-resolution generation of the Stable Diffusion family.',
    },
    features: {
      ar: ['صور حتى 1024×1024', 'منظومة LoRA ضخمة', 'تخصيص واسع بالضبط الدقيق'],
      en: ['Up to 1024×1024', 'Huge LoRA ecosystem', 'Wide fine-tuning support'],
    },
    tags: ['sdxl', 'stable diffusion', 'image', 'صور'],
  },
  {
    id: 'lib.image.sd35-large',
    categoryId: 'image',
    name: 'Stable Diffusion 3.5 Large',
    developer: 'Stability AI',
    license: 'Stability AI Community License',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-large',
    params: '8B',
    io: { in: 'نص · Text prompt', out: 'صورة · Image' },
    requirements: {
      ar: 'أثقل من SDXL — GPU سحابية/مكتبية فقط.',
      en: 'Heavier than SDXL — cloud/desktop GPU only.',
    },
    quality: {
      ar: 'جودة وملتزمة أفضل بالتفاصيل والطباعة داخل الصورة من SDXL.',
      en: 'Better prompt adherence and detail than SDXL, including in-image typography.',
    },
    limits: {
      ar: 'الرخصة المجتمعية تشترط سقف إيرادات للمشاريع التجارية.',
      en: 'The community license ties commercial use to a revenue threshold.',
    },
    cost: {
      ar: 'مجاني للمشاريع دون سقف إيرادات الرخصة؛ راجع الشروط.',
      en: 'Free below the license’s revenue threshold; review the terms.',
    },
    desc: {
      ar: 'أحدث مولدات Stability مفتوحة الأوزان عالية الجودة.',
      en: 'Stability’s newest open-weights, high-quality generator.',
    },
    features: {
      ar: ['التزام أفضل بالوصف', 'تفاصيل وأنماط فنية أغنى', 'دعم ControlNet'],
      en: ['Better prompt adherence', 'Richer detail and styles', 'ControlNet support'],
    },
    tags: ['sd3.5', 'stable diffusion', 'image', 'صور'],
  },

  // ----------------------------------------------------------------- video
  {
    id: 'lib.video.cogvideox-2b',
    categoryId: 'video',
    name: 'CogVideoX-2B',
    developer: 'Zhipu AI / THUDM',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/zai-org/CogVideoX-2b',
    params: '2B',
    io: { in: 'نص · Text prompt', out: 'فيديو · Video' },
    requirements: {
      ar: 'يعمل نظرياً على GPU صغيرة بعد التكميم (T4) — لكنه بعيد تماماً عن قدرة الهاتف.',
      en: 'Quantized builds run on a small GPU (T4) — still far beyond phone capability.',
    },
    quality: {
      ar: 'مقاطع قصيرة بدقة 720×480 عند 8 إطارات/ثانية.',
      en: 'Short clips at 720×480, 8 fps.',
    },
    limits: {
      ar: 'دقة ومدة متواضعة مقارنة بالمولدات السحابية المغلقة.',
      en: 'Modest resolution and duration versus closed cloud generators.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0 (حُدِّثت من رخصة مقيدة في 2024).',
      en: 'Free — Apache-2.0 (updated from a restricted license in 2024).',
    },
    desc: {
      ar: 'مولد الفيديو المفتوح من توليد نص-إلى-فيديو بوزن معتدل.',
      en: 'An open text-to-video model with a moderate footprint.',
    },
    features: {
      ar: ['رخصة Apache-2.0', 'يشتغل على GPU واحدة بعد التكميم', 'نص-إلى-فيديو و صورة-إلى-فيديو في العائلة'],
      en: ['Apache-2.0 licensed', 'Single-GPU after quantization', 'Text- and image-to-video variants in the family'],
    },
    tags: ['cogvideox', 'video', 'فيديو', 'توليد'],
  },
  {
    id: 'lib.video.svd',
    categoryId: 'video',
    name: 'Stable Video Diffusion (img2vid-XT)',
    developer: 'Stability AI',
    license: 'Stability AI Community License',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt',
    params: null,
    io: { in: 'صورة · Image', out: 'فيديو · Video' },
    requirements: {
      ar: 'GPU سحابية/مكتبية — لا تشغيل محمول.',
      en: 'Cloud/desktop GPU — no mobile execution.',
    },
    quality: {
      ar: 'تحريك صورة ثابتة إلى 14–25 إطاراً بجودة بصرية جيدة.',
      en: 'Animates a still image into 14–25 frames with good visual quality.',
    },
    limits: {
      ar: 'غير تجاري افتراضياً؛ لا صوت مولّد؛ حركة قصيرة فقط.',
      en: 'Non-commercial by default; no generated audio; short motion only.',
    },
    cost: {
      ar: 'مجاني للاستخدام المجتمعي غير التجاري.',
      en: 'Free for non-commercial community use.',
    },
    desc: {
      ar: 'تحريك الصور الثابتة إلى مقاطع قصيرة من Stability AI.',
      en: 'Stability AI’s image-to-video animation model.',
    },
    features: {
      ar: ['صورة-إلى-فيديو', 'حتى 25 إطاراً', 'تكامل مع منظومة SD'],
      en: ['Image-to-video', 'Up to 25 frames', 'SD-ecosystem integration'],
    },
    tags: ['svd', 'video', 'فيديو', 'image-to-video'],
  },
  {
    id: 'lib.video.animatediff',
    categoryId: 'video',
    name: 'AnimateDiff',
    developer: 'Columbia / CUHK & Shanda',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/guoyww/animatediff',
    params: null,
    io: { in: 'نص · Text prompt (+ SD checkpoint)', out: 'فيديو · Video (GIF)' },
    requirements: {
      ar: 'يُركَّب فوق Stable Diffusion على GPU — ليس مستقلاً ولا محمولاً.',
      en: 'Mounts on top of Stable Diffusion on a GPU — neither standalone nor mobile.',
    },
    quality: {
      ar: 'حركة سلسة قصيرة (عادة 16 إطاراً) بأسلوب الموديل المستخدم.',
      en: 'Smooth short motion (typically 16 frames) in the style of the underlying model.',
    },
    limits: {
      ar: 'يعتمد كلياً على جودة checkpoint الأساسي؛ مقاطع قصيرة.',
      en: 'Fully dependent on the base checkpoint quality; short clips.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'وحدة حركة تُحوّل أي موديل Stable Diffusion إلى مولد فيديو قصير.',
      en: 'A motion module that turns any Stable Diffusion model into a short-video generator.',
    },
    features: {
      ar: ['يعمل مع موديلات SD المخصصة', 'حركة سلسة', 'رخصة Apache-2.0'],
      en: ['Works with custom SD models', 'Smooth motion', 'Apache-2.0 licensed'],
    },
    tags: ['animatediff', 'video', 'فيديو', 'motion'],
  },

  // ----------------------------------------------------------------- audio
  {
    id: 'lib.audio.musicgen-small',
    categoryId: 'audio',
    name: 'MusicGen Small',
    developer: 'Meta (Audiocraft)',
    license: 'CC-BY-NC 4.0 (weights)',
    availability: 'catalog',
    url: 'https://huggingface.co/facebook/musicgen-small',
    params: '300M',
    io: { in: 'نص وصف الموسيقى · Text prompt', out: 'موسيقى · Audio' },
    requirements: {
      ar: 'يعمل محلياً على GPU متوسطة؛ الموبايل غير مدعوم فعلياً.',
      en: 'Runs locally on a mid-range GPU; phones are not practically supported.',
    },
    quality: {
      ar: 'توليد موسيقى آلية قصيرة (حتى 30 ثانية) من وصف نصي.',
      en: 'Short (up to 30s) instrumental music generation from a text prompt.',
    },
    limits: {
      ar: 'أوزان غير تجارية؛ لحن بلا غناء؛ جودة أدنى من النسخ الكبيرة.',
      en: 'Non-commercial weights; instrumental only; below the larger builds in quality.',
    },
    cost: {
      ar: 'مجاني للاستخدام غير التجاري (رخصة الأوزان CC-BY-NC 4.0).',
      en: 'Free for non-commercial use (weights under CC-BY-NC 4.0).',
    },
    desc: {
      ar: 'مولد الموسيقى من ميتا المفتوح — وصف نصي يتحول إلى مقطع موسيقي.',
      en: 'Meta’s open music generator — a text prompt becomes a music clip.',
    },
    features: {
      ar: ['نص-إلى-موسيقى', 'حجم صغير نسبياً لعائلته', 'تكامل مع Audiocraft'],
      en: ['Text-to-music', 'Small for its family', 'Audiocraft integration'],
    },
    tags: ['musicgen', 'audio', 'موسيقى', 'صوت'],
  },
  {
    id: 'lib.audio.bark',
    categoryId: 'audio',
    name: 'Bark',
    developer: 'Suno',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/suno/bark-small',
    params: null,
    io: { in: 'نص · Text prompt', out: 'كلام/موسيقى/مؤثرات · Speech/music/SFX' },
    requirements: {
      ar: 'يعمل محلياً على GPU أو CPU بطيء — أثقل من TTS التقليدي بمراحل.',
      en: 'Runs locally on GPU or slowly on CPU — much heavier than classic TTS.',
    },
    quality: {
      ar: 'كلام واقعي بضحك وتنهدات، مع موسيقى ومؤثرات من نفس النموذج.',
      en: 'Realistic speech with laughs and sighs, plus music and sound effects from one model.',
    },
    limits: {
      ar: 'لا تحكم دقيق بالنص المنطوق؛ سرعة توليد منخفضة؛ العربية ليست ضمن اللغات الرسمية المعلنة.',
      en: 'Limited control over the exact spoken text; slow generation; Arabic is not among the officially listed languages.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT (الشيفرة والأوزان).',
      en: 'Free — MIT license (code and weights).',
    },
    desc: {
      ar: 'مولد صوتي شامل من Suno: كلام، غناء، مؤثرات — من نص واحد.',
      en: 'Suno’s universal audio generator: speech, music and effects from one prompt.',
    },
    features: {
      ar: ['رخصة MIT كاملة', 'كلام + موسيقى + مؤثرات', 'ضحك وتعبيرات غير لفظية'],
      en: ['Full MIT license', 'Speech + music + SFX', 'Nonverbal expressions like laughter'],
    },
    tags: ['bark', 'audio', 'tts', 'صوت', 'مؤثرات'],
  },
  {
    id: 'lib.audio.stable-audio-open',
    categoryId: 'audio',
    name: 'Stable Audio Open',
    developer: 'Stability AI',
    license: 'Stability AI Community License',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/stable-audio-open-1.0',
    params: null,
    io: { in: 'نص · Text prompt', out: 'مؤثرات/عينات · SFX/samples' },
    requirements: {
      ar: 'GPU مكتبية؛ مخصص لتوليد عينات ومؤثرات قصيرة.',
      en: 'Desktop GPU; built for short samples and sound effects.',
    },
    quality: {
      ar: 'مؤثرات صوتية وعينات درامز حتى ~47 ثانية بجودة إنتاجية.',
      en: 'Production-grade sound effects and drum samples up to ~47 seconds.',
    },
    limits: {
      ar: 'رخصة مجتمعية (سقف إيرادات تجاري)؛ غير مناسب للكلام الطويل.',
      en: 'Community license (commercial revenue cap); not for long-form speech.',
    },
    cost: {
      ar: 'مجاني ضمن شروط الرخصة المجتمعية.',
      en: 'Free within the community-license terms.',
    },
    desc: {
      ar: 'توليد مؤثرات صوتية وعينات مفتوح من Stability AI للمبدعين.',
      en: 'Stability AI’s open generator for sound effects and samples.',
    },
    features: {
      ar: ['مؤثرات وعينات قصيرة', 'مدة حتى ~47 ثانية', 'مفتوح للمبدعين'],
      en: ['Short SFX and samples', 'Up to ~47s', 'Open for creators'],
    },
    tags: ['stable audio', 'audio', 'sfx', 'مؤثرات'],
  },

  // ------------------------------------------------------------- imageEdit
  {
    id: 'lib.imageedit.lama',
    categoryId: 'imageEdit',
    name: 'LaMa (inpainting)',
    developer: 'SAIC (Samsung AI)',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://github.com/advimman/lama',
    params: null,
    io: { in: 'صورة + قناع · Image + mask', out: 'صورة مكتملة · Image' },
    requirements: {
      ar: 'خفيف نسبياً — من أقرب مرشحي التكامل المحمول في فئته.',
      en: 'Relatively light — one of the closest-to-mobile candidates in its class.',
    },
    quality: {
      ar: 'إكمال أجزاء ناقصة من الصورة بنتائج نظيفة على الحواف والأنسجة المتكررة.',
      en: 'Clean inpainting of missing regions, strong on edges and repetitive textures.',
    },
    limits: {
      ar: 'متخصص بالحشو فقط — ليس مولد صور كاملاً.',
      en: 'Inpainting only — not a full image generator.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'أشهر نموذج حشو وإكمال للصور (Large Mask Inpainting).',
      en: 'The best-known image inpainting model (Large Mask Inpainting).',
    },
    features: {
      ar: ['حشو الأجزاء المحذوفة', 'إزالة عناصر من الصور', 'خفيف نسبياً'],
      en: ['Fills removed regions', 'Object removal', 'Relatively light'],
    },
    tags: ['lama', 'inpainting', 'تعديل', 'صور'],
  },
  {
    id: 'lib.imageedit.realesrgan',
    categoryId: 'imageEdit',
    name: 'Real-ESRGAN',
    developer: 'Xinntao',
    license: 'BSD-3-Clause',
    availability: 'catalog',
    url: 'https://github.com/xinntao/Real-ESRGAN',
    params: null,
    io: { in: 'صورة · Image', out: 'صورة مكبّرة · Upscaled image' },
    requirements: {
      ar: 'خفيف ويُشغَّل فعلياً على أجهزة محمولة في تطبيقات أخرى — مرشح تكامل قوي.',
      en: 'Light and already running on phones inside other apps — a strong integration candidate.',
    },
    quality: {
      ar: 'تكبير وتحسين وضوح الصور والرسوم بأربع مراحل دقة.',
      en: 'Upscales and sharpens photos and artwork with practical quality.',
    },
    limits: {
      ar: 'قد يبالغ في تنعيم التفاصيل الحقيقية جداً.',
      en: 'Can over-smooth genuinely fine detail.',
    },
    cost: {
      ar: 'مجاني — رخصة BSD-3-Clause.',
      en: 'Free — BSD-3-Clause licensed.',
    },
    desc: {
      ar: 'المرجع العملي لتكبير الصور واستعادة الوضوح.',
      en: 'The practical reference for image upscaling and restoration.',
    },
    features: {
      ar: ['تكبير ×2–×4', 'معالجة صور واقعية وأنيمي', 'أداء سريع'],
      en: ['×2–×4 upscaling', 'Photos and anime', 'Fast execution'],
    },
    tags: ['realesrgan', 'upscale', 'تعديل', 'تكبير'],
  },
  {
    id: 'lib.imageedit.controlnet',
    categoryId: 'imageEdit',
    name: 'ControlNet v1.1',
    developer: 'Zhang & Agrawala (lllyasviel)',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/lllyasviel/ControlNet-v1-1',
    params: null,
    io: { in: 'صورة تحكم + نص · Control image + prompt', out: 'صورة · Image' },
    requirements: {
      ar: 'يعمل فوق Stable Diffusion على GPU — لا تشغيل محمول.',
      en: 'Runs on top of Stable Diffusion on a GPU — no mobile execution.',
    },
    quality: {
      ar: 'تحكم دقيق بتركيب الصورة عبر حواف، وضعف، عمق، ووضعيات جسم.',
      en: 'Precise composition control via edges, depth, pose and scribbles.',
    },
    limits: {
      ar: 'يحتاج مولد صور أساسياً؛ إعداد أضع من التوليد الحر.',
      en: 'Needs a base image model; more setup than free-form generation.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'الطريقة القياسية لتوجيه مولدات الصور بشروط بصرية دقيقة.',
      en: 'The standard way to steer image generators with precise visual conditions.',
    },
    features: {
      ar: ['تحكم بالوضعيات والحواف والعمق', 'يعمل مع أي SD', 'منظومة أدوات ضخمة'],
      en: ['Pose/edge/depth control', 'Works with any SD model', 'Huge tool ecosystem'],
    },
    tags: ['controlnet', 'تعديل', 'تحكم', 'صور'],
  },

  // -------------------------------------------------------- imageUnderstand
  {
    id: 'lib.imageunderstand.qwen2vl-7b',
    categoryId: 'imageUnderstand',
    name: 'Qwen2-VL-7B-Instruct',
    developer: 'Alibaba Qwen',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct',
    params: '7B',
    io: { in: 'صورة/فيديو + نص · Image/video + text', out: 'نص · Text' },
    requirements: {
      ar: 'النسخة 2B أقرب للهواتف؛ 7B يحتاج أجهزة قوية — لا تكامل في رفيق بعد.',
      en: 'The 2B variant is closest to phones; 7B needs stronger hardware — no Rafeeq integration yet.',
    },
    quality: {
      ar: 'قراءة متقدمة للصور والفيديو مع OCR قوي ومتابعة محادثة بصرية.',
      en: 'Advanced image/video understanding with strong OCR and visual conversation.',
    },
    limits: {
      ar: '72B وحده تحت رخصة Qwen؛ نسختا 2B و7B تحت Apache-2.0.',
      en: 'Only the 72B sits under the Qwen license; 2B and 7B are Apache-2.0.',
    },
    cost: {
      ar: 'مجاني — Apache-2.0 للنسختين 2B و7B.',
      en: 'Free — Apache-2.0 for the 2B and 7B variants.',
    },
    desc: {
      ar: 'نموذج رؤية-ولغة يفهم الصور والفيديو ويجيب عنها نصياً.',
      en: 'A vision-language model that understands images and video and answers about them.',
    },
    features: {
      ar: ['أسئلة وأجوبة عن الصور', 'OCR متعدد اللغات', 'فهم فيديو'],
      en: ['Image Q&A', 'Multilingual OCR', 'Video understanding'],
    },
    tags: ['qwen2-vl', 'vlm', 'vision', 'رؤية', 'صور'],
  },
  {
    id: 'lib.imageunderstand.moondream2',
    categoryId: 'imageUnderstand',
    name: 'Moondream2',
    developer: 'vikhyatk',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/vikhyatk/moondream2',
    params: '1.9B',
    io: { in: 'صورة + نص · Image + text', out: 'نص · Text' },
    requirements: {
      ar: 'من أصغر نماذج الرؤية — أقرب مرشح عملي لتشغيل محمول في فئته.',
      en: 'Among the smallest vision models — the most practical mobile candidate in its class.',
    },
    quality: {
      ar: 'وصف صور وأسئلة وأجوبة بجودة تتفوق على حجمه.',
      en: 'Image captioning and Q&A punching above its size.',
    },
    limits: {
      ar: 'لا يفهم الفيديو؛ المعرفة العامة محدودة بالحجم.',
      en: 'No video understanding; general knowledge limited by size.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'نموذج رؤية صغير جداً يجيب عن أسئلة الصور على أجهزة ضعيفة.',
      en: 'A very small vision model answering image questions on modest hardware.',
    },
    features: {
      ar: ['حجم صغير جداً', 'وصف الصور وأسئلة عنها', 'رخصة Apache-2.0'],
      en: ['Very small footprint', 'Captioning and visual Q&A', 'Apache-2.0 licensed'],
    },
    tags: ['moondream', 'vlm', 'vision', 'رؤية'],
  },
  {
    id: 'lib.imageunderstand.llava16',
    categoryId: 'imageUnderstand',
    name: 'LLaVA-v1.6 (Mistral-7B)',
    developer: 'UW-Madison',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/liuhaotian/llava-v1.6-mistral-7b',
    params: '7B',
    io: { in: 'صورة + نص · Image + text', out: 'نص · Text' },
    requirements: {
      ar: 'يحتاج GPU أو تشغيلاً مكمماً خارج الهاتف — لا تكامل في رفيق.',
      en: 'Needs a GPU or off-phone quantized runtimes — no Rafeeq integration.',
    },
    quality: {
      ar: 'أشهر عائلة رؤية-ولغة مفتوحة، ومبنى متوافق مع llama.cpp (بملف mmproj).',
      en: 'The best-known open vision-language family, built llama.cpp-compatible (mmproj file).',
    },
    limits: {
      ar: 'الهلوسة البصرية واردة؛ يحتاج توثيقاً عند الاستخدام الحساس.',
      en: 'Visual hallucinations happen; verify before sensitive use.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'عائلة LLaVA الشهيرة للتفاهم البصري بنسخة قاعدة Mistral.',
      en: 'The famous LLaVA visual-understanding family on a Mistral base.',
    },
    features: {
      ar: ['محادثة بصرية', 'متوافق مع llama.cpp', 'منظومة مشتقات واسعة'],
      en: ['Visual conversation', 'llama.cpp compatible', 'Broad derivative ecosystem'],
    },
    tags: ['llava', 'vlm', 'vision', 'رؤية'],
  },

  // ---------------------------------------------------------------- coding
  {
    id: 'lib.coding.qwen25-coder-7b',
    categoryId: 'coding',
    name: 'Qwen2.5-Coder-7B-Instruct',
    developer: 'Alibaba Qwen',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct',
    params: '7B',
    io: { in: 'نص/شيفرة · Text/code', out: 'شيفرة · Code' },
    requirements: {
      ar: '7B فوق قدرة الهاتف المريحة — النسخ الأصغر (0.5B/1.5B/3B) مرشحة مستقبلاً.',
      en: '7B exceeds comfortable phone capacity — the smaller sizes (0.5B/1.5B/3B) are future candidates.',
    },
    quality: {
      ar: 'من أقوى نماذج الشيفرة المفتوحة في حجمه: إكمال، إصلاح، وشرح.',
      en: 'Among the strongest open code models at its size: completion, repair and explanation.',
    },
    limits: {
      ar: 'راجع النتائج دائماً — التوليد قد يحتوي أخطاء منطقية.',
      en: 'Always review output — generated code can carry logic bugs.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'الفرع البرمجي من عائلة Qwen2.5 بجودة تنافسية.',
      en: 'The code branch of the Qwen2.5 family with competitive quality.',
    },
    features: {
      ar: ['إكمال شيفرة وشرحها', 'أحجام متعددة حتى 0.5B', 'رخصة Apache-2.0'],
      en: ['Code completion and explanation', 'Sizes down to 0.5B', 'Apache-2.0 licensed'],
    },
    tags: ['qwen coder', 'code', 'برمجة', 'شيفرة'],
  },
  {
    id: 'lib.coding.codellama-7b',
    categoryId: 'coding',
    name: 'CodeLlama-7B-Instruct',
    developer: 'Meta',
    license: 'Code Llama License',
    availability: 'catalog',
    url: 'https://huggingface.co/codellama/CodeLlama-7b-Instruct-hf',
    params: '7B',
    io: { in: 'نص/شيفرة · Text/code', out: 'شيفرة · Code' },
    requirements: {
      ar: '7B يحتاج أجهزة مكتبية/خادم؛ لا يعمل داخل رفيق.',
      en: '7B needs desktop/server-class hardware; not runnable inside Rafeeq.',
    },
    quality: {
      ar: 'الجيل التاريخي الذي أسس فئة نماذج الشيفرة المفتوحة.',
      en: 'The historical generation that founded the open code-model category.',
    },
    limits: {
      ar: 'تفوقته تجاوزته أجيال أحدث (Qwen2.5-Coder, StarCoder2).',
      en: 'Newer generations (Qwen2.5-Coder, StarCoder2) have passed it.',
    },
    cost: {
      ar: 'مجاني ضمن رخصة Code Llama (سقف مستخدمين تجاري).',
      en: 'Free under the Code Llama license (commercial MAU cap).',
    },
    desc: {
      ar: 'نموذج ميتا للشيفرة بنسخة التوجيه (Instruct).',
      en: 'Meta’s code model in its instruct variant.',
    },
    features: {
      ar: ['إكمال وشرح الشيفرة', 'يدعم لغات رئيسية كثيرة', 'متوافق مع llama.cpp'],
      en: ['Code completion and explanation', 'Many mainstream languages', 'llama.cpp compatible'],
    },
    tags: ['codellama', 'meta', 'code', 'برمجة'],
  },
  {
    id: 'lib.coding.starcoder2-7b',
    categoryId: 'coding',
    name: 'StarCoder2-7B',
    developer: 'BigCode (Hugging Face × ServiceNow × NVIDIA)',
    license: 'BigCode OpenRAIL-M v1',
    availability: 'catalog',
    url: 'https://huggingface.co/bigcode/starcoder2-7b',
    params: '7B',
    io: { in: 'شيفرة · Code', out: 'شيفرة · Code' },
    requirements: {
      ar: '7B يحتاج تشغيلاً مكتبياً؛ لا يعمل داخل رفيق.',
      en: '7B needs desktop-class execution; not runnable inside Rafeeq.',
    },
    quality: {
      ar: 'تدريب شفاف على The Stack v2 (3.5 تريليون رمز، 17 لغة برمجة) وسياق 16,384.',
      en: 'Transparent training on The Stack v2 (3.5T tokens, 17 languages) with a 16,384-token context.',
    },
    limits: {
      ar: 'رخصة OpenRAIL تضع قيود استخدام يجب قراءتها؛ ملء المنتصف بدل المحادثة.',
      en: 'OpenRAIL adds use restrictions worth reading; fill-in-the-middle rather than chat.',
    },
    cost: {
      ar: 'مجاني ضمن شروط BigCode OpenRAIL-M.',
      en: 'Free under the BigCode OpenRAIL-M terms.',
    },
    desc: {
      ar: 'جيل BigCode الثاني الشفاف بالكامل في التدريب والبيانات.',
      en: 'BigCode’s second generation, fully transparent in data and training.',
    },
    features: {
      ar: ['سياق 16K', 'ملء-المنتصف (FIM)', 'شفافية تدريب كاملة'],
      en: ['16K context', 'Fill-in-the-middle', 'Full training transparency'],
    },
    tags: ['starcoder', 'bigcode', 'code', 'برمجة'],
  },

  // ----------------------------------------------------------------- threeD
  {
    id: 'lib.3d.triposr',
    categoryId: 'threeD',
    name: 'TripoSR',
    developer: 'Stability AI × Tripo AI',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/TripoSR',
    params: null,
    io: { in: 'صورة واحدة · Single image', out: 'مجسم · 3D mesh' },
    requirements: {
      ar: 'توليد خلال ثوانٍ على GPU مكتبية — لا يعمل على الهاتف.',
      en: 'Generates in seconds on a desktop GPU — will not run on a phone.',
    },
    quality: {
      ar: 'سرعة قياسية: مجسم ثلاثي الأبعاد من صورة واحدة في أقل من ثانية على A100.',
      en: 'Benchmark speed: a 3D mesh from one image in under a second on an A100.',
    },
    limits: {
      ar: 'جودة الهندسة أدنى من الأنظمة المدفوعة؛ يعتمد على زاوية الصورة.',
      en: 'Geometry quality below paid systems; depends on the input viewpoint.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'أسرع مولد مجسمات مفتوح: صورة واحدة تصبح نموذجاً ثلاثي الأبعاد.',
      en: 'The fastest open 3D generator: one image becomes a 3D model.',
    },
    features: {
      ar: ['صورة-إلى-مجسم', 'توليد في أقل من ثانية (GPU)', 'رخصة MIT'],
      en: ['Image-to-3D', 'Sub-second generation (GPU)', 'MIT licensed'],
    },
    tags: ['triposr', '3d', 'مجسمات'],
  },
  {
    id: 'lib.3d.shap-e',
    categoryId: 'threeD',
    name: 'Shap-E',
    developer: 'OpenAI',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://github.com/openai/shap-e',
    params: null,
    io: { in: 'نص أو صورة · Text or image', out: 'مجسم + دوال ضمنية · 3D + implicit functions' },
    requirements: {
      ar: 'GPU مكتبية؛ عدة تشغيل بايثون — لا تكامل محمول.',
      en: 'Desktop GPU; Python tooling — no mobile integration.',
    },
    quality: {
      ar: 'يولّد مجسمات صريحة ودوال ضمنية قابلة للتحرير والتصيير.',
      en: 'Produces explicit meshes and editable, renderable implicit functions.',
    },
    limits: {
      ar: 'تفاصيل هندسية منخفضة الدقة مقارنة بالمولدات الحديثة.',
      en: 'Low-geometry-detail versus newer generators.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'مولد مفتوح من OpenAI يحول النص أو الصورة إلى مجسمات.',
      en: 'OpenAI’s open generator turning text or images into 3D assets.',
    },
    features: {
      ar: ['نص-إلى-مجسم وصورة-إلى-مجسم', 'دوال ضمنية قابلة للتصيير', 'رخصة MIT'],
      en: ['Text/image-to-3D', 'Renderable implicit functions', 'MIT licensed'],
    },
    tags: ['shap-e', 'openai', '3d', 'مجسمات'],
  },
  {
    id: 'lib.3d.sf3d',
    categoryId: 'threeD',
    name: 'Stable Fast 3D',
    developer: 'Stability AI',
    license: 'Stability AI Community License',
    availability: 'catalog',
    url: 'https://huggingface.co/stabilityai/stable-fast-3d',
    params: null,
    io: { in: 'صورة واحدة · Single image', out: 'مجسم بملمس · Textured mesh' },
    requirements: {
      ar: 'GPU مكتبية؛ توليد خلال ثوانٍ — لا تشغيل محمول.',
      en: 'Desktop GPU; generation in seconds — no mobile execution.',
    },
    quality: {
      ar: 'مجسمات ملمسة جاهزة للاستخدام بسرعة عالية (0.7 ثانية تقريباً لكل عنصر).',
      en: 'Ready-to-use textured meshes at high speed (~0.7s per asset).',
    },
    limits: {
      ar: 'رخصة مجتمعية بسقف إيرادات؛ جودة تتأثر بصور الإدخال.',
      en: 'Community license with a revenue cap; quality tracks input-image quality.',
    },
    cost: {
      ar: 'مجاني ضمن شروط الرخصة المجتمعية.',
      en: 'Free within the community-license terms.',
    },
    desc: {
      ar: 'توليد مجسمات ملمسة سريع من صورة واحدة من Stability AI.',
      en: 'Stability AI’s fast single-image textured-mesh generator.',
    },
    features: {
      ar: ['مجسم ملمس جاهز', 'سرعة قصوى', 'فك الأشكال المتعددة'],
      en: ['Ready textured mesh', 'Top speed', 'UV unwrapping'],
    },
    tags: ['sf3d', 'stable fast 3d', '3d', 'مجسمات'],
  },

  // ------------------------------------------------------------ translation
  {
    id: 'lib.translation.madlad400',
    categoryId: 'translation',
    name: 'MADLAD-400 (3B-MT)',
    developer: 'Google',
    license: 'Apache-2.0',
    availability: 'catalog',
    url: 'https://huggingface.co/google/madlad400-3b-mt',
    params: '3B',
    io: { in: 'نص · Text', out: 'نص مترجم · Translated text' },
    requirements: {
      ar: '3B على حافة إمكانية الهاتف بعد التكميم — تكامل ممكن مستقبلاً.',
      en: '3B sits at the edge of phone feasibility after quantization — a possible future integration.',
    },
    quality: {
      ar: 'تدريب على 1 تريليون رمز لأكثر من 450 لغة بمستوى وثائقي مدقق.',
      en: 'Trained on 1T tokens across 450+ languages with audited documentation.',
    },
    limits: {
      ar: 'معمارية T5 — تحتاج محرك تشغيل مختلفاً عن llama.cpp.',
      en: 'T5 architecture — needs a runtime beyond llama.cpp.',
    },
    cost: {
      ar: 'مجاني — رخصة Apache-2.0.',
      en: 'Free — Apache-2.0 licensed.',
    },
    desc: {
      ar: 'نموذج ترجمة مفتوح من جوجل بتغطية لغات هائلة تشمل العربية.',
      en: 'Google’s open translation model with massive language coverage, Arabic included.',
    },
    features: {
      ar: ['450+ لغة', 'ترجمة بمستوى الوثيقة', 'رخصة Apache-2.0'],
      en: ['450+ languages', 'Document-level translation', 'Apache-2.0 licensed'],
    },
    tags: ['madlad', 'translation', 'ترجمة', 'عربي'],
  },
  {
    id: 'lib.translation.nllb-200',
    categoryId: 'translation',
    name: 'NLLB-200 (Distilled 600M)',
    developer: 'Meta',
    license: 'CC-BY-NC 4.0',
    availability: 'catalog',
    url: 'https://huggingface.co/facebook/nllb-200-distilled-600M',
    params: '600M',
    io: { in: 'نص · Text', out: 'نص مترجم · Translated text' },
    requirements: {
      ar: '600M صغير بما يكفي نظرياً للهاتف — لكن المعمارية غير llama.cpp.',
      en: '600M is theoretically phone-sized — but the architecture is outside llama.cpp.',
    },
    quality: {
      ar: 'مرجع «لا لغة تُترك خلف الظهور»: 200 لغة بجودة مدروسة منها العربية.',
      en: 'The “No Language Left Behind” reference: 200 languages with studied quality, Arabic included.',
    },
    limits: {
      ar: 'رخصة غير تجارية تمنع الاستخدام التجاري.',
      en: 'Non-commercial license bars commercial use.',
    },
    cost: {
      ar: 'مجاني للاستخدام غير التجاري — CC-BY-NC 4.0.',
      en: 'Free for non-commercial use — CC-BY-NC 4.0.',
    },
    desc: {
      ar: 'مشروع ميتا الشهير للترجمة بين 200 لغة.',
      en: 'Meta’s well-known 200-language translation project.',
    },
    features: {
      ar: ['200 لغة', 'حجم مقطر 600M', 'تقييمات مفتوحة (FLORES)'],
      en: ['200 languages', 'Distilled 600M size', 'Open evaluation (FLORES)'],
    },
    tags: ['nllb', 'translation', 'ترجمة', 'عربي'],
  },
  {
    id: 'lib.translation.opus-mt',
    categoryId: 'translation',
    name: 'OPUS-MT',
    developer: 'Helsinki-NLP (University of Helsinki)',
    license: null,
    availability: 'catalog',
    url: 'https://huggingface.co/Helsinki-NLP',
    params: null,
    io: { in: 'نص · Text', out: 'نص مترجم · Translated text' },
    requirements: {
      ar: 'نماذج ثنائية صغيرة (لكل زوج لغوي) قابلة نظرياً للتشغيل المحمول.',
      en: 'Small pairwise models (per language pair), theoretically phone-viable.',
    },
    quality: {
      ar: 'آلاف أزواج الترجمة بأداء متين وأحجام صغيرة جداً.',
      en: 'Thousands of translation pairs with solid quality at very small sizes.',
    },
    limits: {
      ar: 'الرخصة تختلف بين النماذج (بعضها CC-BY وبعضها Apache) — راجع بطاقة كل نموذج.',
      en: 'Licenses vary per model (some CC-BY, some Apache) — check each model card.',
    },
    cost: {
      ar: 'مجاني بحسب رخصة كل نموذج.',
      en: 'Free per each model’s own license.',
    },
    desc: {
      ar: 'عائلة أضخم نماذج الترجمة الثنائية المفتوحة من جامعة هلسنكي.',
      en: 'The University of Helsinki’s huge open pairwise-translation family.',
    },
    features: {
      ar: ['آلاف الأزواج اللغوية', 'أحجام صغيرة جداً', 'تشغيل محلي سهل'],
      en: ['Thousands of language pairs', 'Very small models', 'Easy local serving'],
    },
    tags: ['opus-mt', 'helsinki', 'translation', 'ترجمة'],
  },

  // -------------------------------------------------------------- research
  {
    id: 'lib.research.bge-m3',
    categoryId: 'research',
    name: 'BGE-M3',
    developer: 'BAAI',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/BAAI/bge-m3',
    params: '568M',
    io: { in: 'نص · Text', out: 'تضمين متعدد الأنماط · Multi-format embedding' },
    requirements: {
      ar: '568M قابل للتشغيل المحمول نظرياً بمحرك تضمين مخصص — غير مدمج في رفيق بعد.',
      en: '568M is theoretically phone-viable with a dedicated embedding runtime — not integrated into Rafeeq yet.',
    },
    quality: {
      ar: 'تضمين كثيف + متفرق + متعدد المتجهات مع 100+ لغة وسياق 8,192 — العمود الفقري المثالي لـRAG محلي.',
      en: 'Dense + sparse + multi-vector retrieval across 100+ languages with an 8,192 context — the ideal backbone for local RAG.',
    },
    limits: {
      ar: 'يحتاج قاعدة بيانات متجهات محلية (مثل sqlite-vec) بجانب النموذج.',
      en: 'Needs a local vector store (e.g. sqlite-vec) alongside the model.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'نموذج التضمين متعدد الأساليب الأشهر للبحث الدلالي والاسترجاع.',
      en: 'The best-known multi-format embedding model for semantic search and retrieval.',
    },
    features: {
      ar: ['بحث دلالي متعدد الأنماط', '100+ لغة', 'سياق 8K'],
      en: ['Multi-format semantic search', '100+ languages', '8K context'],
    },
    tags: ['bge', 'embedding', 'rag', 'بحث', 'استرجاع'],
  },
  {
    id: 'lib.research.e5-small',
    categoryId: 'research',
    name: 'E5-small-v2',
    developer: 'Microsoft',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/intfloat/e5-small-v2',
    params: '33M',
    io: { in: 'نص · Text', out: 'تضمين · Embedding' },
    requirements: {
      ar: '33M فقط — أخف نموذج تضمين عملي على الإطلاق للهواتف.',
      en: 'Just 33M — the lightest practical embedding model for phones.',
    },
    quality: {
      ar: 'جودة بحث دلالي جيدة جداً لحجمه المتناهي الصغر.',
      en: 'Very good retrieval quality for its tiny size.',
    },
    limits: {
      ar: 'سياق 512 رمزاً؛ إنجليزي في الأساس.',
      en: '512-token context; primarily English.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'نموذج تضمين متناهي الصغر من مايكروسوفت يصلح للتشغيل الدائم على الهاتف.',
      en: 'Microsoft’s tiny embedding model suited to always-on phone use.',
    },
    features: {
      ar: ['33M فقط', 'سرعة فورية', 'رخصة MIT'],
      en: ['Only 33M', 'Instant speed', 'MIT licensed'],
    },
    tags: ['e5', 'embedding', 'rag', 'بحث'],
  },
  {
    id: 'lib.research.r1-distill-15b',
    categoryId: 'research',
    name: 'DeepSeek-R1-Distill-Qwen-1.5B',
    developer: 'DeepSeek',
    license: 'MIT',
    availability: 'catalog',
    url: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    params: '1.5B',
    io: { in: 'نص · Text', out: 'نص باستدلال متسلسل · Reasoned text' },
    requirements: {
      ar: '1.5B ضمن نطاق الهواتف عبر llama.cpp — مرشح تكامل قوي مستقبلاً في رفيق.',
      en: '1.5B is within phone range via llama.cpp — a strong future integration candidate for Rafeeq.',
    },
    quality: {
      ar: 'تقطير لقدرات الاستدلال العميق من R1 إلى حجم صغير — يكتب سلسلة تفكير قبل الإجابة.',
      en: 'Distills R1’s deep reasoning into a small size — writes a thinking chain before answering.',
    },
    limits: {
      ar: 'السلسلة الطويلة تستهلك السياق والوقت؛ العربية أضعف من الإنجليزية.',
      en: 'Long chains consume context and time; Arabic trails English.',
    },
    cost: {
      ar: 'مجاني — رخصة MIT.',
      en: 'Free — MIT licensed.',
    },
    desc: {
      ar: 'نسخة مقطرة من DeepSeek-R1 للاستدلال المتسلسل بحجم يعمل محلياً.',
      en: 'A distilled DeepSeek-R1 for chain-of-thought reasoning at a locally runnable size.',
    },
    features: {
      ar: ['استدلال متسلسل مرئي', 'حجم محمول', 'رخصة MIT'],
      en: ['Visible chain-of-thought', 'Phone-scale size', 'MIT licensed'],
    },
    tags: ['deepseek', 'r1', 'reasoning', 'استدلال', 'rag'],
  },
];
