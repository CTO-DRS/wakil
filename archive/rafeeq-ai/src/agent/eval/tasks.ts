// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The Phase-5 evaluation suite: 110 real tasks, Saudi Arabic first (96),
 * with English controls (14). Every task names the tools a correct plan
 * should call, in order; steps with tool=null (answer composition) are not
 * counted. All 29 registered tools appear at least twice, so a regression
 * in any one capability shows up in the report.
 *
 * Used by the plan-only benchmark (benchmark.ts) and by the full-loop
 * evaluation harness (eval/harness.ts) that reports success rate, misfire
 * rate and per-task latency.
 */

import type { Language } from '../../types';

export interface BenchmarkTask {
  id: string;
  goal: string;
  locale: Language;
  /** Tool names a correct plan should call, in order. */
  expectedTools: readonly string[];
  /** Human-readable intent tag for reporting. */
  intent: string;
}

export const BENCHMARK_TASKS: readonly BenchmarkTask[] = [
  { id: 't01', goal: 'دوّن مذكرة: أتصل على أبوي بعد العصر', locale: 'ar', expectedTools: ['notes.create'], intent: 'note-write' },
  { id: 't02', goal: 'وش الساعة الحين؟', locale: 'ar', expectedTools: ['time.now'], intent: 'time-query' },
  { id: 't03', goal: 'كم التاريخ اليوم بالميلادي؟', locale: 'ar', expectedTools: ['time.now'], intent: 'time-query' },
  { id: 't04', goal: 'أي نموذج شغّال عندك الحين؟', locale: 'ar', expectedTools: ['device.model_info'], intent: 'model-info' },
  { id: 't05', goal: 'مين مذكراتي اللي حفظتها؟', locale: 'ar', expectedTools: ['notes.list'], intent: 'notes-read' },
  { id: 't06', goal: 'دوّن لي مذكرة أشتري خبز وطلبان, وخلّني أعرف وش الوقت الحين', locale: 'ar', expectedTools: ['notes.create', 'time.now'], intent: 'note+time' },
  { id: 't07', goal: 'خلّني أشوف مذكراتي وبعدها دوّن مذكرة جديدة بعنوان موعد الدكتور', locale: 'ar', expectedTools: ['notes.list', 'notes.create'], intent: 'notes-read+write' },
  { id: 't08', goal: 'سجّل مذكرة: أدرب الجيم بعد المغرب يوم الأحد', locale: 'ar', expectedTools: ['notes.create'], intent: 'note-write' },
  { id: 't09', goal: 'هل النموذج اللي محمّل الحين جاهز؟ وش اسمه؟', locale: 'ar', expectedTools: ['device.model_info'], intent: 'model-info' },
  { id: 't10', goal: 'دوّن مذكرة أدفع فاتورة النت قبل الخامس, وقلّي كم الساعة', locale: 'ar', expectedTools: ['notes.create', 'time.now'], intent: 'note+time' },
  { id: 't11', goal: 'وش عندي من مذكرات عن الشغل؟', locale: 'ar', expectedTools: ['notes.list'], intent: 'notes-read' },
  { id: 't12', goal: 'اكتب لي مذكرة: كلم خالد بخصوص الاجتماع غداً', locale: 'ar', expectedTools: ['notes.create'], intent: 'note-write' },
  { id: 't13', goal: 'الساعة كم عندك الحين؟ وخش سجّل مذكرة صلّي العصر', locale: 'ar', expectedTools: ['time.now', 'notes.create'], intent: 'time+note' },
  { id: 't14', goal: 'أبغى أعرف وش النموذج الحالي ووش الوقت الحين', locale: 'ar', expectedTools: ['device.model_info', 'time.now'], intent: 'model+time' },
  { id: 't15', goal: 'دوّن مذكرة: أرجع كتاب المكتبة الجمعة', locale: 'ar', expectedTools: ['notes.create'], intent: 'note-write' },
  { id: 't16', goal: 'خلّني أعرف الوقت ودوّن مذكرة القاء الدواء الساعة التاسعة', locale: 'ar', expectedTools: ['time.now', 'notes.create'], intent: 'time+note' },
  { id: 't17', goal: 'What time is it right now?', locale: 'en', expectedTools: ['time.now'], intent: 'time-query' },
  { id: 't18', goal: 'Save a note: call the bank tomorrow morning', locale: 'en', expectedTools: ['notes.create'], intent: 'note-write' },
  { id: 't19', goal: 'Show me my saved notes', locale: 'en', expectedTools: ['notes.list'], intent: 'notes-read' },
  { id: 't20', goal: 'Which model is currently loaded?', locale: 'en', expectedTools: ['device.model_info'], intent: 'model-info' },

  // ---- reminders.create (Saudi dialect, varied phrasings) ----
  { id: 't21', goal: 'ذكّرني أتصل على أبوي بعد العصر', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't22', goal: 'ذكّرني آخذ الدواء الساعة تسع مساءً', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't23', goal: 'لا تنساني أدفع فاتورة الكهرباء يوم الأحد', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't24', goal: 'فكّرني أجيب العيدية من الصراف قبل المغرب', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't25', goal: 'خلّ لي تنبيه الصبح الساعة سبعة أراجع فيه إيميل الشغل', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't26', goal: 'ذكّرني بتمارين العلاج بكرة بعد الفجر', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't27', goal: 'نبّهني الساعة 2026-11-10T09:00 قبل اجتماع الفريق بساعة', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't28', goal: 'ذكّرني أرتّب موعد الدكتور يوم الثلاثاء الجاي', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't29', goal: 'خلّني ما أنسى آخذ خالتي من المطار بكرة الساعة 8 مساءً', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't30', goal: 'أبغى تنبيه اسمه موعد العيادة يوم الخميس الساعة الرابعة عصرًا', locale: 'ar', expectedTools: ['reminders.create'], intent: 'reminder-write' },

  // ---- reminders.list ----
  { id: 't31', goal: 'وش التنبيهات اللي ضبطتها؟', locale: 'ar', expectedTools: ['reminders.list'], intent: 'reminder-read' },
  { id: 't32', goal: 'اعرض لي تذكيراتي القادمة', locale: 'ar', expectedTools: ['reminders.list'], intent: 'reminder-read' },
  { id: 't33', goal: 'عندي تذكيرات محفوظة؟ وش هي؟', locale: 'ar', expectedTools: ['reminders.list'], intent: 'reminder-read' },

  // ---- reminders.cancel ----
  { id: 't34', goal: 'ألغِ تذكير موعد العيادة — معرّفه r_123', locale: 'ar', expectedTools: ['reminders.cancel'], intent: 'reminder-cancel' },
  { id: 't35', goal: 'امسح التنبيه اللي رقمه r_456 ما أحتاجه', locale: 'ar', expectedTools: ['reminders.cancel'], intent: 'reminder-cancel' },
  { id: 't36', goal: 'ألغِ التذكير اللي معرّفه r_789', locale: 'ar', expectedTools: ['reminders.cancel'], intent: 'reminder-cancel' },

  // ---- alarms.set ----
  { id: 't37', goal: 'اضبط لي منبه الفجر الساعة أربعة والخمسين دقيقة', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't38', goal: 'حط منبه بكرة الساعة ست ونص الصبح', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't39', goal: 'أبغى منبه الساعة خمس الفجر اسمه صلاة الفجر', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't40', goal: 'ضبّط منبه العصر ثلاث والنص', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't41', goal: 'منبه الساعة 21:30 الليلة', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't42', goal: 'أيقظني السابعة والربع مساءً', locale: 'ar', expectedTools: ['alarms.set'], intent: 'alarm' },

  // ---- timers.set ----
  { id: 't43', goal: 'ضع لي مؤقت عشر دقايق للكيك', locale: 'ar', expectedTools: ['timers.set'], intent: 'timer' },
  { id: 't44', goal: 'خلّ مؤقت خمس دقايق أستناه للشاي', locale: 'ar', expectedTools: ['timers.set'], intent: 'timer' },
  { id: 't45', goal: 'مؤقت ساعة للدراسة يبدأ الحين', locale: 'ar', expectedTools: ['timers.set'], intent: 'timer' },
  { id: 't46', goal: 'اضبط لي مؤقت ثلاثين ثانية', locale: 'ar', expectedTools: ['timers.set'], intent: 'timer' },

  // ---- calendar.events ----
  { id: 't47', goal: 'وش عندي الأسبوع الجاي؟', locale: 'ar', expectedTools: ['calendar.events'], intent: 'calendar-read' },
  { id: 't48', goal: 'اعرض لي مواعيدي بكرة', locale: 'ar', expectedTools: ['calendar.events'], intent: 'calendar-read' },
  { id: 't49', goal: 'وش اجتماعاتي الأيام الجاية؟', locale: 'ar', expectedTools: ['calendar.events'], intent: 'calendar-read' },
  { id: 't50', goal: 'قلّي وش عندي يوم الخميس من أحداث التقويم', locale: 'ar', expectedTools: ['calendar.events'], intent: 'calendar-read' },

  // ---- calendar.create ----
  { id: 't51', goal: 'سجّل لي موعد طبيب الأسنان بكرة الساعة أربعة عصرًا', locale: 'ar', expectedTools: ['calendar.create'], intent: 'calendar-create' },
  { id: 't52', goal: 'حط في التقويم اجتماع الفريق يوم الأحد الساعة عشر الصبح', locale: 'ar', expectedTools: ['calendar.create'], intent: 'calendar-create' },
  { id: 't53', goal: 'أضف حدث عزيمة العشا عند أبو فهد يوم الجمعة الثامنة مساءً', locale: 'ar', expectedTools: ['calendar.create'], intent: 'calendar-create' },
  { id: 't54', goal: 'خلّ حدث بالتقويم: رحلة الرياض يوم 2026-11-20', locale: 'ar', expectedTools: ['calendar.create'], intent: 'calendar-create' },

  // ---- calendar.move ----
  { id: 't55', goal: 'أجّل الحدث اللي رقمه 12 إلى 2026-11-11 الساعة الخامسة عصرًا', locale: 'ar', expectedTools: ['calendar.move'], intent: 'calendar-move' },
  { id: 't56', goal: 'انقل الموعد رقم 34 إلى اليوم الساعة 8 مساءً', locale: 'ar', expectedTools: ['calendar.move'], intent: 'calendar-move' },

  // ---- contacts ----
  { id: 't57', goal: 'دوّر لي رقم جوال أبو سعيد', locale: 'ar', expectedTools: ['contacts.search'], intent: 'contact-search' },
  { id: 't58', goal: 'وش رقم خالد في جهات الاتصال؟', locale: 'ar', expectedTools: ['contacts.search'], intent: 'contact-search' },
  { id: 't59', goal: 'ابحث في جهاتي عن صيدلية النهدي', locale: 'ar', expectedTools: ['contacts.search'], intent: 'contact-search' },
  { id: 't60', goal: 'اتصل على أبوي الحين', locale: 'ar', expectedTools: ['contacts.search', 'contacts.call'], intent: 'contact-call' },
  { id: 't61', goal: 'سوّي مكالمة لأمي بسرعة', locale: 'ar', expectedTools: ['contacts.search', 'contacts.call'], intent: 'contact-call' },
  { id: 't62', goal: 'اتصل على الرقم 0501234567', locale: 'ar', expectedTools: ['contacts.call'], intent: 'contact-call' },

  // ---- messages ----
  { id: 't63', goal: 'أبشر لأبو أحمد رسالة: توصل بكرة إن شاء الله', locale: 'ar', expectedTools: ['messages.sms_draft'], intent: 'sms-draft' },
  { id: 't64', goal: 'جهّز لي رسالة نصية لأخوي: لا تنسى الفاتورة', locale: 'ar', expectedTools: ['messages.sms_draft'], intent: 'sms-draft' },
  { id: 't65', goal: 'اكتب رسالة للرقم 0555555555: وصلت البيت', locale: 'ar', expectedTools: ['messages.sms_draft'], intent: 'sms-draft' },
  { id: 't66', goal: 'افتح واتساب مع رسالة جاهزة لأمي: وصلك الطلب؟', locale: 'ar', expectedTools: ['messages.whatsapp_draft'], intent: 'whatsapp-draft' },
  { id: 't67', goal: 'جهّز واتساب لخالد: الاجتماع تأجل لبكرة', locale: 'ar', expectedTools: ['messages.whatsapp_draft'], intent: 'whatsapp-draft' },
  { id: 't68', goal: 'أرسل واتساب على 966501234567: مبروك النجاح', locale: 'ar', expectedTools: ['messages.whatsapp_draft'], intent: 'whatsapp-draft' },

  // ---- device settings ----
  { id: 't69', goal: 'شغّل لي فلاش الجوال', locale: 'ar', expectedTools: ['device.torch'], intent: 'device-torch' },
  { id: 't70', goal: 'طفي مصباح الجوال', locale: 'ar', expectedTools: ['device.torch'], intent: 'device-torch' },
  { id: 't71', goal: 'خلّ الجوال على وضع عدم الإزعاج', locale: 'ar', expectedTools: ['device.dnd'], intent: 'device-dnd' },
  { id: 't72', goal: 'أوقف وضع عدم الإزعاج', locale: 'ar', expectedTools: ['device.dnd'], intent: 'device-dnd' },
  { id: 't73', goal: 'خفّف سطوع الشاشة لخمسين', locale: 'ar', expectedTools: ['device.brightness'], intent: 'device-brightness' },
  { id: 't74', goal: 'زوّد الإضاءة إلى أقصى شي', locale: 'ar', expectedTools: ['device.brightness'], intent: 'device-brightness' },
  { id: 't75', goal: 'افتح لي إعدادات الواي فاي', locale: 'ar', expectedTools: ['device.wifi_panel'], intent: 'device-wifi' },
  { id: 't76', goal: 'أبغى أدخل صفحة الشبكات أبدّل الراوتر', locale: 'ar', expectedTools: ['device.wifi_panel'], intent: 'device-wifi' },

  // ---- memory ----
  { id: 't77', goal: 'تذكر إني أحب القهوة بدون سكر', locale: 'ar', expectedTools: ['memory.save'], intent: 'memory-write' },
  { id: 't78', goal: 'احفظ في ذاكرتك إني أشتغل مهندس شبكات', locale: 'ar', expectedTools: ['memory.save'], intent: 'memory-write' },
  { id: 't79', goal: 'خذ بالك إني أفضّل الاتصال بعد العصر واحفظها', locale: 'ar', expectedTools: ['memory.save'], intent: 'memory-write' },
  { id: 't80', goal: 'وش تعرف عن شغلي؟', locale: 'ar', expectedTools: ['memory.search'], intent: 'memory-read' },
  { id: 't81', goal: 'تذكر لي وش قلت لك عن قهوتي', locale: 'ar', expectedTools: ['memory.search'], intent: 'memory-read' },
  { id: 't82', goal: 'انسَ المعلومة اللي معرّفها m_12', locale: 'ar', expectedTools: ['memory.forget'], intent: 'memory-forget' },
  { id: 't83', goal: 'احذف من ذاكرتك المعلومة رقم m_34', locale: 'ar', expectedTools: ['memory.forget'], intent: 'memory-forget' },

  // ---- todos ----
  { id: 't84', goal: 'أضف مهمة: أسوّي تمارين الصبح', locale: 'ar', expectedTools: ['todos.add'], intent: 'todo-write' },
  { id: 't85', goal: 'سجّل لي مهمة أراجع العقد قبل الخميس', locale: 'ar', expectedTools: ['todos.add'], intent: 'todo-write' },
  { id: 't86', goal: 'حط في مهامي: أشتري هدية زواج سعود', locale: 'ar', expectedTools: ['todos.add'], intent: 'todo-write' },
  { id: 't87', goal: 'وش مهامي اللي ما خلصتها؟', locale: 'ar', expectedTools: ['todos.list'], intent: 'todo-read' },
  { id: 't88', goal: 'اعرض لي قائمة المهام', locale: 'ar', expectedTools: ['todos.list'], intent: 'todo-read' },
  { id: 't89', goal: 'خلّصت مهمة t_12 علّمها منجزة', locale: 'ar', expectedTools: ['todos.complete'], intent: 'todo-complete' },
  { id: 't90', goal: 'علّم المهمة اللي رقمها t_34 كمكتملة', locale: 'ar', expectedTools: ['todos.complete'], intent: 'todo-complete' },

  // ---- prayer ----
  { id: 't91', goal: 'وش وقت صلاة العصر بالرياض؟', locale: 'ar', expectedTools: ['prayer.times'], intent: 'prayer-read' },
  { id: 't92', goal: 'مواقيت الصلاة اليوم في جدة', locale: 'ar', expectedTools: ['prayer.times'], intent: 'prayer-read' },
  { id: 't93', goal: 'وش وقت الفجر بكرة بالمدينة المنورة؟', locale: 'ar', expectedTools: ['prayer.times'], intent: 'prayer-read' },
  { id: 't94', goal: 'ذكّرني بكل الصلوات اليوم', locale: 'ar', expectedTools: ['prayer.reminders_set'], intent: 'prayer-reminders' },
  { id: 't95', goal: 'ضع لي تنبيهات الصلاة في الدمام', locale: 'ar', expectedTools: ['prayer.reminders_set'], intent: 'prayer-reminders' },

  // ---- briefing ----
  { id: 't96', goal: 'رتّب لي يومي', locale: 'ar', expectedTools: ['briefing.today'], intent: 'briefing' },
  { id: 't97', goal: 'ملخص اليوم: مواعيدي وتذكيراتي وصلواتي', locale: 'ar', expectedTools: ['briefing.today'], intent: 'briefing' },

  // ---- multi-tool combinations ----
  { id: 't98', goal: 'ذكّرني أتصل على أبوي بعد العصر وقلّي كم الساعة الحين', locale: 'ar', expectedTools: ['time.now', 'reminders.create'], intent: 'time+reminder' },
  { id: 't99', goal: 'وش وقت المغرب؟ وبعدها دوّن مذكرة أصلّي في جامع الحي', locale: 'ar', expectedTools: ['prayer.times', 'notes.create'], intent: 'prayer+note' },
  { id: 't100', goal: 'رتّب لي بكرة: اعرض أحداث التقويم وبعدها ذكّرني بالتسوق الساعة 6 مساءً', locale: 'ar', expectedTools: ['calendar.events', 'reminders.create'], intent: 'calendar+reminder' },

  // ---- English controls ----
  { id: 't101', goal: 'Remind me to call dad after Asr', locale: 'en', expectedTools: ['reminders.create'], intent: 'reminder-write' },
  { id: 't102', goal: "What's on my calendar next week?", locale: 'en', expectedTools: ['calendar.events'], intent: 'calendar-read' },
  { id: 't103', goal: 'Set an alarm for 5:30 am', locale: 'en', expectedTools: ['alarms.set'], intent: 'alarm' },
  { id: 't104', goal: 'Start a 10 minute timer', locale: 'en', expectedTools: ['timers.set'], intent: 'timer' },
  { id: 't105', goal: 'Find Khalid in my contacts and draft him a WhatsApp', locale: 'en', expectedTools: ['contacts.search', 'messages.whatsapp_draft'], intent: 'contact+whatsapp' },
  { id: 't106', goal: 'What time is Fajr in Riyadh tomorrow?', locale: 'en', expectedTools: ['prayer.times'], intent: 'prayer-read' },
  { id: 't107', goal: 'Give me my day briefing', locale: 'en', expectedTools: ['briefing.today'], intent: 'briefing' },
  { id: 't108', goal: 'Add a task to review the contract', locale: 'en', expectedTools: ['todos.add'], intent: 'todo-write' },
  { id: 't109', goal: 'Remember that I prefer tea without sugar', locale: 'en', expectedTools: ['memory.save'], intent: 'memory-write' },
  { id: 't110', goal: 'Turn on the flashlight and set brightness to maximum', locale: 'en', expectedTools: ['device.torch', 'device.brightness'], intent: 'torch+brightness' },
];
