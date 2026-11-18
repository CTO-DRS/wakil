package com.wakil.agent.github

import android.content.Context

enum class BuildKind { ANDROID, FLUTTER, WEB }

data class GhTemplate(
    val id: String, val title: String, val lang: String, val subtitle: String,
    val kind: BuildKind, val webDir: String = "www",
)

/** Project templates shipped in assets/gh-templates (no names starting with "_" or ".": aapt drops them), each with a GitHub Actions workflow that builds an APK. */
object Templates {
    val all = listOf(
        GhTemplate("android-kotlin", "Android · Kotlin", "Kotlin", "تطبيق أندرويد أصلي بلغة Kotlin (Gradle)", BuildKind.ANDROID),
        GhTemplate("android-java", "Android · Java", "Java", "تطبيق أندرويد أصلي بلغة Java (Gradle)", BuildKind.ANDROID),
        GhTemplate("flutter", "Flutter · Dart", "Dart", "واجهة جميلة بلغة Dart، الملفات تُنشأ تلقائياً في السحاب", BuildKind.FLUTTER),
        GhTemplate("web", "HTML · CSS · JS", "JavaScript", "موقع ويب يتحول لتطبيق عبر Capacitor", BuildKind.WEB, "www"),
        GhTemplate("nextjs", "Next.js · React", "JavaScript", "Next.js (تصدير ثابت) داخل تطبيق Capacitor", BuildKind.WEB, "out"),
    )

    data class Names(val app: String, val pkg: String, val dart: String, val npm: String)

    fun names(appName: String, repoName: String): Names {
        val base = repoName.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_').ifEmpty { "app" }
        val ident = if (base.first().isDigit()) "app_$base" else base
        return Names(
            app = appName.ifBlank { repoName },
            pkg = "com.wakil." + ident.replace("_", ""),
            dart = ident,
            npm = ident.replace('_', '-'),
        )
    }

    internal fun render(s: String, n: Names, webDir: String) = s
        .replace("@@APP_NAME@@", n.app).replace("@@PACKAGE@@", n.pkg).replace("@@DART_NAME@@", n.dart)
        .replace("@@NPM_NAME@@", n.npm).replace("@@ORG@@", n.pkg.substringBeforeLast('.'))
        .replace("@@WEB_DIR@@", webDir)

    internal fun repoPath(p: String, n: Names) = p
        .replace(Regex("(^|/)PKGPATH(/|$)")) { it.groupValues[1] + n.pkg.replace('.', '/') + it.groupValues[2] }
        .replace(Regex("(^|/)dot-github/"), "$1.github/")
        .replace(Regex("(^|/)dot-wakil/"), "$1.wakil/")
        .let { if (it == "gitignore" || it.endsWith("/gitignore")) it.dropLast(9) + ".gitignore" else it }

    private fun walk(ctx: Context, dir: String, prefix: String, out: MutableMap<String, String>) {
        val kids = ctx.assets.list(dir).orEmpty()
        for (k in kids) {
            val full = "$dir/$k"; val rel = if (prefix.isEmpty()) k else "$prefix/$k"
            val sub = ctx.assets.list(full).orEmpty()
            if (sub.isNotEmpty()) walk(ctx, full, rel, out)
            else out[rel] = ctx.assets.open(full).bufferedReader().use { it.readText() }
        }
    }

    /** Signing key + workflow for a build kind (also used to add a build to an existing repo). */
    fun buildFiles(ctx: Context, kind: BuildKind, n: Names, webDir: String): Map<String, String> {
        val out = linkedMapOf<String, String>()
        val raw = mutableMapOf<String, String>()
        walk(ctx, "gh-templates/common", "", raw)
        raw.forEach { (p, c) -> out[repoPath(p, n)] = c }
        val wf = when (kind) { BuildKind.ANDROID -> "android"; BuildKind.FLUTTER -> "flutter"; BuildKind.WEB -> "web" }
        out[".github/workflows/wakil-build-apk.yml"] =
            render(ctx.assets.open("gh-templates/workflows/$wf.yml").bufferedReader().use { it.readText() }, n, webDir)
        return out
    }

    fun files(ctx: Context, t: GhTemplate, n: Names): Map<String, String> {
        val raw = linkedMapOf<String, String>()
        walk(ctx, "gh-templates/${t.id}", "", raw)
        val out = linkedMapOf<String, String>()
        raw.forEach { (p, c) -> out[repoPath(p, n)] = render(c, n, t.webDir) }
        out["README.md"] = "# ${n.app}\n\nأُنشئ بواسطة **وكيل** 🤖 — قالب ${t.title}.\n\n" +
            "كل `push` يبني ملف APK تلقائياً في GitHub Actions (تبويب Actions ← Artifacts).\n"
        out += buildFiles(ctx, t.kind, n, t.webDir)
        return out
    }

    /** Guess how an existing repo should be built from its root file names. Returns kind, webDir and a warning. */
    fun detect(rootNames: Set<String>, packageJson: String?, nextConfig: String?): Triple<BuildKind, String, String?>? {
        fun has(vararg n: String) = n.any { it in rootNames }
        return when {
            has("pubspec.yaml") -> Triple(BuildKind.FLUTTER, "", null)
            has("settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts") && !has("package.json") ->
                Triple(BuildKind.ANDROID, "", null)
            has("next.config.js", "next.config.mjs", "next.config.ts") -> Triple(
                BuildKind.WEB, "out",
                if (nextConfig != null && !nextConfig.contains("export")) "أضف output: 'export' إلى next.config حتى يُصدَّر الموقع إلى مجلد out." else null
            )
            has("vite.config.js", "vite.config.ts", "vite.config.mjs") -> Triple(BuildKind.WEB, "dist", null)
            packageJson?.contains("react-scripts") == true -> Triple(BuildKind.WEB, "build", null)
            has("capacitor.config.json", "capacitor.config.ts") -> Triple(BuildKind.WEB, "www", null)
            has("www") -> Triple(BuildKind.WEB, "www", null)
            has("index.html") -> Triple(BuildKind.WEB, ".", null)
            has("package.json") -> Triple(BuildKind.WEB, "dist", "تأكد أن npm run build يُخرج الموقع إلى مجلد dist.")
            else -> null
        }
    }
}
