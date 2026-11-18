#!/usr/bin/env bash
# التحقق من اكتمال الدمج الموحد CTO-DRS/wakil — الوضع بعد تنفيذ الدمج فعلياً.
#
# الاستخدام (من مالك الحساب):
#   GITHUB_TOKEN=ghp_xxx ./publish-unified.sh            # تحقق فقط — آمن تماماً، لا ينشئ ولا يحذف
#   GITHUB_TOKEN=ghp_xxx ./publish-unified.sh --public   # تحقق ثم جعل المستودع عاماً
#
# الوضع الحالي: المستودعات القديمة الخمسة محذوفة، وwakil هو المرجع الوحيد
# (انظر docs/MERGE.md). هذا السكربت يتحقق من سلامة الحالة النهائية ويمنع
# الانتقال إلى العام ما دام أي سر توقيع في الشجرة أو في المستودع عن بعد.
# صلاحيات التوكن: قراءة (Contents:Read) — وتُضاف Administration:ReadWrite عند --public فقط.
set -euo pipefail

OWNER="CTO-DRS"; REPO="wakil"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OLD_REPOS=(wakil-public rafeeq-ai DRS-AI-Assistant DRS-AI-Download mosaed-os-android)
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PUBLIC="no"; [ "${1:-}" = "--public" ] && PUBLIC="yes"

: "${GITHUB_TOKEN:?اضبط GITHUB_TOKEN أولاً}"
AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")
API="https://api.github.com"
api() { curl -sS -o "$TMP/out" -w '%{http_code}' "${AUTH[@]}" "$@"; }
FAIL=0
ok()  { echo "✓ $*"; }
bad() { echo "✗ $*"; FAIL=1; }

echo "== 1) المستودع الموحد $OWNER/$REPO =="
code=$(api "$API/repos/$OWNER/$REPO")
[ "$code" = "200" ] || { echo "✗ المستودع غير قابل للوصول (HTTP $code)"; exit 1; }
python3 -c "import json;d=json.load(open('$TMP/out'));print('  الرؤية:', 'خاص' if d['private'] else 'عام', '| الفرع الافتراضي:', d['default_branch'], '| الحجم:', d['size'], 'KB')"

echo "== 2) الملفات المحورية موجودة عن بعد =="
for f in app/build.gradle.kts README.md README-ar.md docs/MERGE.md docs/WAKIL-HISTORY-ar.md portal/index.html scripts/publish-unified.sh .gitattributes LICENSE .gitignore; do
  code=$(api "$API/repos/$OWNER/$REPO/contents/$f")
  case "$code" in 200) ok "$f";; *) bad "مفقود عن بعد: $f (HTTP $code)";; esac
done

echo "== 3) خلو المستودع من أسرار التوقيع =="
for f in archive/mosaed-os/android/mosaed-release.jks archive/mosaed-os/android/keystore.properties; do
  code=$(api "$API/repos/$OWNER/$REPO/contents/$f")
  [ "$code" = "404" ] && ok "محذوف عن بعد: $f" || bad "ما زال موجوداً عن بعد: $f — أعد تنظيف التاريخ"
done
if find "$SRC" -path "$SRC/.git" -prune -o \( -name '*.jks' -o -name 'keystore.properties' \) -print | grep -q .; then
  bad "ملفات سرية في الشجرة المحلية:"
  find "$SRC" -path "$SRC/.git" -prune -o \( -name '*.jks' -o -name 'keystore.properties' \) -print
else
  ok "الشجرة المحلية خالية من *.jks وkeystore.properties"
fi

echo "== 4) المستودعات القديمة الخمسة محذوفة =="
for r in "${OLD_REPOS[@]}"; do
  code=$(api "$API/repos/$OWNER/$r")
  [ "$code" = "404" ] && ok "محذوف: $r" || bad "ما زال موجوداً: $r (HTTP $code)"
done

if [ "$PUBLIC" = "yes" ]; then
  [ "$FAIL" = "0" ] || { echo "✗ لا يجوز الانتقال إلى العام مع الإخفاقات أعلاه"; exit 1; }
  echo "== 5) الانتقال إلى المستودع العام =="
  code=$(api -X PATCH "$API/repos/$OWNER/$REPO" -d '{"private":false}')
  [ "$code" = "200" ] && ok "المستودع أصبح عاماً" || { echo "✗ فشل الانتقال (HTTP $code):"; cat "$TMP/out"; exit 1; }
  echo "⚠ ألغِ التوكن الآن: GitHub ← Settings ← Developer settings ← Tokens"
fi

[ "$FAIL" = "0" ] && echo "== النتيجة: الدمج مكتمل والحالة سليمة ✓" || { echo "== النتيجة: إخفاقات تحتاج معالجة ✗"; exit 1; }
