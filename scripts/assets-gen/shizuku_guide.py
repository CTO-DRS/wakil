# Single source for the Shizuku guide: generates the in-app Kotlin data (ShizukuGuideData.kt) and out/SHIZUKU-GUIDE-ar.md
import json, os
P='/workspace/projects/63d46980-7164-4457-910d-060f812d1fca'
LINKS=[
 ("gh","GitHub","https://github.com/RikkaApps/Shizuku/releases/latest","صفحة الإصدارات الرسمية: حمّل أحدث إصدار من «Assets» ← ملف ‎.apk"),
 ("play","Google Play","https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api","التثبيت والتحديث التلقائي من المتجر"),
 ("repo","المستودع على GitHub","https://github.com/RikkaApps/Shizuku","الشيفرة المصدرية والمشاكل المعروفة"),
 ("guide","الدليل الرسمي","https://shizuku.rikka.app/guide/setup.html","شرح المطوّرين بالإنجليزية"),
]
WHY_GH="لماذا GitHub؟ لأنه الإصدار الرسمي مباشرةً من مطوّري Shizuku، ويصل فيه أحدث إصدار أولاً."
START_SH="adb shell sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh"
ALT="pm_path=$(pm path moe.shizuku.privileged.api) && apk_path=${pm_path#package:} && $(dirname $apk_path)/lib/*/libshizuku.so"
S=[
 dict(icon="Info",color="Cyan",title="ما هو Shizuku ولماذا يستخدمه وكيل؟",kind="bullets",items=[
  "Shizuku تطبيق مجاني ومفتوح المصدر يتيح للتطبيقات استخدام صلاحيات ADB (مستوى «adb shell») مباشرةً على الهاتف — بدون روت.",
  "يستخدمه وكيل في أداة sys_shell لتنفيذ أوامر النظام التي لا يستطيع تطبيق عادي تنفيذها، ولتحكّم أسرع وأدق بالشاشة.",
  "آمن: لا يمنح روت، وأنت من يقرّر أي تطبيق يحصل على الإذن، وكل أمر حسّاس ينتظر موافقتك داخل وكيل.",
  "يمكنك سحب الإذن في أي وقت من داخل Shizuku، أو تعطيله من إعدادات وكيل.",
  "يتوقف Shizuku عند إعادة تشغيل الهاتف، إلا إذا فعّلت التشغيل التلقائي (متاح في الإصدارات الحديثة).",
 ]),
 dict(icon="Download",color="Blue",title="تثبيت Shizuku",kind="steps",items=[
  "اضغط زر «GitHub» (الموصى به) في قسم التنزيل لفتح صفحة الإصدارات.",
  "حمّل أحدث إصدار: في صفحة الإصدار افتح قسم «Assets» واضغط على ملف التطبيق (ينتهي بـ ‎.apk‎).",
  "افتح الملف بعد اكتمال التنزيل. إن طُلب منك، اسمح للمتصفح بـ «تثبيت التطبيقات غير المعروفة»، ثم ارجع واضغط «تثبيت».",
  "أو بدلاً من ذلك: ثبّته من Google Play بالزر «Google Play».",
 ]),
 dict(icon="DeveloperMode",color="Violet",title="تفعيل «خيارات المطوّر»",kind="steps",items=[
  "افتح الإعدادات ← «حول الهاتف».",
  "اضغط على «رقم الإصدار» (Build number) سبع مرات متتالية حتى تظهر رسالة «أنت الآن مطوّر».",
  "على هواتف Infinix (XOS): الإعدادات ← حول الهاتف ← رقم الإصدار، واضغط عليه سبع مرات.",
  "ستجد «خيارات المطوّر» في الإعدادات ← النظام (أو في آخر قائمة الإعدادات).",
 ]),
 dict(icon="Wifi",color="Cyan",title="التشغيل عبر «تصحيح الأخطاء اللاسلكي» (أندرويد 11 فأحدث)",kind="steps",items=[
  "اتصل بأي شبكة Wi-Fi (حتى لو بدون إنترنت).",
  "خيارات المطوّر ← فعّل «تصحيح الأخطاء اللاسلكي» (Wireless debugging).",
  "افتح Shizuku واضغط «الإقران» (Pairing) — سيظهر إشعار من Shizuku.",
  "ارجع إلى «تصحيح الأخطاء اللاسلكي» واضغط «إقران الجهاز باستخدام رمز الإقران».",
  "اكتب الرمز المكوّن من 6 أرقام في ردّ إشعار Shizuku (اسحب الإشعارات للأسفل واضغط «إدخال الرمز»).",
  "ارجع إلى Shizuku واضغط «بدء» (Start). عند النجاح يظهر أن Shizuku يعمل.",
 ]),
 dict(icon="VerifiedUser",color="Green",title="منح الإذن لوكيل",kind="steps",items=[
  "ارجع إلى وكيل.",
  "اضغط «منح الإذن» (في بطاقة الحالة بالأعلى، أو في خطوة Shizuku، أو في الإعدادات).",
  "اختر «السماح» في نافذة Shizuku — تتحوّل الحالة إلى «جاهز ✓».",
 ]),
 dict(icon="RestartAlt",color="Amber",title="بعد إعادة تشغيل الهاتف",kind="steps",items=[
  "يتوقف Shizuku بعد كل إعادة تشغيل — هذا طبيعي.",
  "فعّل «تصحيح الأخطاء اللاسلكي»، ثم افتح Shizuku واضغط «بدء» فقط؛ لا حاجة لتكرار الإقران.",
  "في الإصدارات الحديثة على أندرويد 13 فأحدث، يستطيع Shizuku البدء تلقائياً عند الاتصال بشبكة Wi-Fi موثوقة — فعّل الخيار من إعدادات Shizuku.",
 ]),
 dict(icon="Computer",color="Blue",title="بديل: التشغيل من الكمبيوتر عبر ADB",kind="steps",items=[
  "فعّل «تصحيح أخطاء USB» من خيارات المطوّر، ووصّل الهاتف بالكمبيوتر (ووافق على بصمة الكمبيوتر على الهاتف).",
  {"t":"نفّذ هذا الأمر على الكمبيوتر:","code":START_SH},
  {"t":"إن لم يعمل، ادخل إلى ‎adb shell‎ ونفّذ الأمر البديل:","code":ALT},
  "بعدها افتح Shizuku للتأكد أنه يعمل، ثم امنح الإذن لوكيل.",
 ]),
 dict(icon="Build",color="Red",title="حل المشاكل",kind="bullets",items=[
  "«تصحيح الأخطاء اللاسلكي» ينطفئ وحده: أبقِ Wi-Fi متصلاً؛ النظام يطفئه عند انقطاع الشبكة.",
  "هواتف Infinix / XOS: أوقف «تحسين البطارية» لتطبيق Shizuku، وثبّته (اقفله) في قائمة التطبيقات الأخيرة حتى لا يغلقه النظام.",
  "إشعار الإقران لا يظهر: فعّل إشعارات Shizuku من الإعدادات ← التطبيقات ← Shizuku ← الإشعارات.",
  "ظهر أن «Shizuku متوقف»: شغّله مجدداً بالضغط على «بدء» كما في خطوة التشغيل.",
  "«الإعدادات المقيّدة» في أندرويد 13 فأحدث تخص تفعيل خدمة الوصول لوكيل ولا علاقة لها بـ Shizuku: افتح معلومات تطبيق وكيل ← القائمة (⋮) ← «السماح بالإعدادات المقيّدة».",
 ]),
 dict(icon="Bolt",color="Magenta",title="ماذا يستطيع وكيل مع Shizuku؟",kind="steps",items=[
  {"t":"عرض التطبيقات المثبّتة:","code":"pm list packages -3"},
  {"t":"تغيير الإعدادات (مثل سطوع الشاشة):","code":"settings put system screen_brightness 120"},
  {"t":"إيقاف تطبيق بالقوة:","code":"am force-stop com.example.app"},
  {"t":"التقاط لقطة شاشة:","code":"screencap -p /sdcard/Pictures/wakil.png"},
  "كل أمر يمرّ عبر أداة sys_shell ويطلب موافقتك افتراضياً.",
  "لسحب الصلاحية: افتح Shizuku ← التطبيقات المصرّح لها ← ألغِ «وكيل»، أو عطّل «تفعيل Shizuku» من إعدادات وكيل، أو أوقف Shizuku.",
 ]),
]
def kstr(s): return json.dumps(s,ensure_ascii=False).replace('$','\\$')
# ---- Kotlin
k=['package com.wakil.agent.ui','','// GENERATED by work/shizuku-guide/guide.py — edit there.','import androidx.compose.material.icons.Icons','import androidx.compose.material.icons.filled.*','import com.wakil.agent.ui.theme.Neon','',
   'internal object ShizukuGuideData {']
k.append('    const val WHY_GITHUB = %s'%kstr(WHY_GH))
k.append('    val links = listOf(')
for id_,t,u,d in LINKS: k.append('        GuideLink(%s, %s, %s, %s),'%(kstr(id_),kstr(t),kstr(u),kstr(d)))
k.append('    )')
k.append('    val sections = listOf(')
for s in S:
    items=[]
    for it in s['items']:
        if isinstance(it,str): items.append('GuideItem(%s)'%kstr(it))
        else: items.append('GuideItem(%s, %s)'%(kstr(it['t']),kstr(it['code'])))
    k.append('        GuideSection(%s, Icons.Filled.%s, Neon.%s, numbered = %s, items = listOf(\n            %s,\n        )),'%(kstr(s['title']),s['icon'],s['color'],'true' if s['kind']=='steps' else 'false',',\n            '.join(items)))
k.append('    )\n}')
open(P+'/wakil/app/src/main/java/com/wakil/agent/ui/ShizukuGuideData.kt','w').write('\n'.join(k)+'\n')
# ---- Markdown
m=['# دليل تفعيل Shizuku لتطبيق وكيل','',
   'Shizuku يمنح وكيل صلاحيات النظام (ADB) بدون روت. اتّبع الخطوات بالترتيب؛ تستغرق العملية بضع دقائق مرة واحدة فقط.','',
   '## روابط التنزيل','']
for id_,t,u,d in LINKS:
    m.append(f'- **{t}**{" (موصى به ⭐)" if id_=="gh" else ""}: {d}  \n  <{u}>')
m+=['',f'> {WHY_GH}','']
for i,s in enumerate(S,1):
    m.append(f'## {i}. {s["title"]}'); m.append('')
    for j,it in enumerate(s['items'],1):
        pre=f'{j}.' if s['kind']=='steps' else '-'
        if isinstance(it,str): m.append(f'{pre} {it}')
        else:
            m.append(f'{pre} {it["t"]}'); m.append(''); m.append('   ```'); m.append('   '+it['code']); m.append('   ```')
    m.append('')
m.append('---'); m.append('دليل وكيل · يمكنك أيضاً فتح هذا الدليل من داخل التطبيق: الإعدادات ← «دليل Shizuku».')
open(P+'/out/SHIZUKU-GUIDE-ar.md','w').write('\n'.join(m)+'\n')
json.dump(dict(links=LINKS,why=WHY_GH,sections=S),open(P+'/work/shizuku-guide/guide.json','w'),ensure_ascii=False,indent=1)
print('ok')
