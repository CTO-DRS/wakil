#!/usr/bin/env bash
# نشر المستودع الموحد CTO-DRS/wakil ثم حذف المستودعات القديمة الستة.
#
# الاستخدام (من مالك الحساب فقط):
#   GITHUB_TOKEN=ghp_xxx CONFIRM_DELETE=yes ./publish-unified.sh            # خاص (افتراضي)
#   GITHUB_TOKEN=ghp_xxx CONFIRM_DELETE=yes ./publish-unified.sh --public   # عام
#
# ⚠ قبل --public راجع الأرشيف: archive/mosaed-os/android/mosaed-release.jks
#   مفتاح إصدار قديم — انقله خارج المستودع إن أردت العام.
# صلاحيات التوكن: كلاسيك PAT بـ repo + delete_repo، أو Fine-grained بـ
#   Contents(ReadWrite) + Administration(ReadWrite).
# الترتيب آمن عمداً: إنشاء مرحلي ← دفع ← تحقق ← حذف الستة ← إعادة تسمية إلى wakil.
set -euo pipefail

OWNER="CTO-DRS"; REPO="wakil"; STAGE="wakil-unified-stage"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="no"; [ "${1:-}" = "--public" ] && PUBLIC="yes"
OLD_REPOS=(wakil-public rafeeq-ai DRS-AI-Assistant DRS-AI-Download mosaed-os-android wakil)

: "${GITHUB_TOKEN:?اضبط GITHUB_TOKEN أولاً}"
AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")
API="https://api.github.com"
api() { curl -sS -o /tmp/pu-api.out -w '%{http_code}' "${AUTH[@]}" "$@"; }

echo "== 1) فحوص الأمان قبل أي شيء =="
for d in rafeeq-ai drs-ai-assistant mosaed-os; do
  [ -d "$SRC/archive/$d" ] || { echo "✗ الأرشيف ناقص: archive/$d — إلغاء"; exit 1; }
done
[ -f "$SRC/app/build.gradle.kts" ] || { echo "✗ مجلد التسليم غير مكتمل — إلغاء"; exit 1; }
echo "الأرشيف الثلاثي والتسليم مكتملان ✓"
[ "$PUBLIC" = "yes" ] && echo "⚠ وضع عام: أنت توافق بنشر archive/ كاملاً بما فيه مفتاح مosaed"

echo "== 2) إنشاء المستودع المرحلي ودفع التسليم =="
code=$(api "$API/repos/$OWNER/$STAGE")
if [ "$code" = "404" ]; then
  priv="true"; [ "$PUBLIC" = "yes" ] && priv="false"
  code=$(api -X POST "$API/user/repos" \
    -d "{\"name\":\"$STAGE\",\"private\":$priv,\"description\":\"Wakil 4.0.0 — وكيل موحد متكامل\",\"has_wiki\":false}")
  [ "$code" = "201" ] || { echo "✗ فشل إنشاء المستودع (HTTP $code):"; cat /tmp/pu-api.out; exit 1; }
fi

cd "$SRC"
rm -f local.properties; rm -rf app/build .gradle .kotlin
git init -b main >/dev/null 2>&1 || true
git config user.name "Z User"; git config user.email "z@users.noreply.github.com"
git add -A
git commit -m "Wakil 4.0.0 unified — التطبيق الواحد بمظاهر الهويات المدمجة" >/dev/null || echo "(لا تغييرات جديدة)"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$GITHUB_TOKEN@github.com/$OWNER/$STAGE.git"
git push -u origin main --force 2>&1 | sed -E 's/x-access-token:[^@]+@/x-access-token:***@/g' | tail -1

echo "== 3) تحقق الدفع (لن يُحذف شيء قبله) =="
sleep 2
code=$(api "$API/repos/$OWNER/$STAGE")
[ "$code" = "200" ] || { echo "✗ تعذر التحقق من الدفع (HTTP $code) — إلغاء قبل الحذف"; exit 1; }
branch=$(python3 -c "import json;print(json.load(open('/tmp/pu-api.out'))['default_branch'])")
[ "$branch" = "main" ] || { echo "✗ الفرع الافتراضي ليس main — إلغاء قبل الحذف"; exit 1; }
echo "الدفع مؤكد على $OWNER/$STAGE (main) ✓"

[ "${CONFIRM_DELETE:-no}" = "yes" ] || { echo "⏸ أوقِف قبل الحذف: أعد التشغيل مع CONFIRM_DELETE=yes"; exit 0; }

echo "== 4) حذف المستودعات الستة القديمة =="
for r in "${OLD_REPOS[@]}"; do
  code=$(api -X DELETE "$API/repos/$OWNER/$r")
  case "$code" in
    204) echo "حُذف: $r ✓";;
    404) echo "غير موجود (ربما حُذف سابقاً): $r";;
    *)   echo "✗ تعذر حذف $r (HTTP $code) — غالباً ينقص صلاحية delete_repo:"; cat /tmp/pu-api.out; exit 1;;
  esac
done

echo "== 5) إعادة التسمية إلى wakil =="
code=$(api -X PATCH "$API/repos/$OWNER/$STAGE" -d "{\"name\":\"$REPO\"}")
[ "$code" = "200" ] || { echo "✗ فشلت إعادة التسمية (HTTP $code) — المرحلي باقٍ باسم $STAGE:"; cat /tmp/pu-api.out; exit 1; }
echo "اكتمل: $OWNER/$REPO هو المستودع الوحيد ✓"
echo "⚠ ألغِ التوكن الآن: GitHub ← Settings ← Developer settings ← Tokens"
