/* Host smoke test for wakil_pty.c (build machine, not Android).
   Mirrors the app design: one reader thread pump()s the master fd, main thread writes.
   Uses a minimal fake JNIEnv so the JNI code paths run unchanged against glibc openpty. */
#include <jni.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>

typedef struct { int len; void *data; } FakeArray;

static jint f_GetArrayLength(JNIEnv *e, jobjectArray a) { (void)e; return a ? ((FakeArray *)a)->len : 0; }
static jobject f_GetObjectArrayElement(JNIEnv *e, jobjectArray a, jint i) { (void)e; return (jobject)(((void **)((FakeArray *)a)->data)[i]); }
static const char *f_GetStringUTFChars(JNIEnv *e, jstring s, jboolean *c) { (void)e; (void)c; return (const char *)s; }
static void f_ReleaseStringUTFChars(JNIEnv *e, jstring s, const char *c) { (void)e; (void)s; (void)c; }
static jbyte *f_GetByteArrayElements(JNIEnv *e, jbyteArray a, jboolean *c) { (void)e; (void)c; return (jbyte *)((FakeArray *)a)->data; }
static void f_ReleaseByteArrayElements(JNIEnv *e, jbyteArray a, jbyte *b, jint m) { (void)e; (void)a; (void)b; (void)m; }

jint Java_com_wakil_agent_env_PtyNative_spawn(void*, void*, void*, void*, void*, jint, jint);
jint Java_com_wakil_agent_env_PtyNative_read(void*, void*, jint, void*);
jint Java_com_wakil_agent_env_PtyNative_write(void*, void*, jint, void*, jint);
jint Java_com_wakil_agent_env_PtyNative_resize(void*, void*, jint, jint, jint);
void Java_com_wakil_agent_env_PtyNative_kill(void*, void*, jint);
jint Java_com_wakil_agent_env_PtyNative_wait(void*, void*, jint);
void Java_com_wakil_agent_env_PtyNative_close(void*, void*, jint);

static char g_out[16384];
static size_t g_len = 0;
static pthread_mutex_t g_mu = PTHREAD_MUTEX_INITIALIZER;
static volatile jint g_id = -1;
static JNIEnv *g_env;

static void *pump(void *arg) {
    (void)arg;
    static unsigned char buf[4096];
    FakeArray jbuf = { (int)sizeof(buf), buf };
    for (;;) {
        jint sid = g_id;
        if (sid < 0) break;
        jint n = Java_com_wakil_agent_env_PtyNative_read(g_env, NULL, sid, (jbyteArray)&jbuf);
        if (n <= 0) break;
        pthread_mutex_lock(&g_mu);
        if (g_len + n < sizeof(g_out)) { memcpy(g_out + g_len, buf, n); g_len += n; g_out[g_len] = 0; }
        pthread_mutex_unlock(&g_mu);
    }
    return NULL;
}

static int have(const char *needle) {
    pthread_mutex_lock(&g_mu);
    int ok = strstr(g_out, needle) != NULL;
    pthread_mutex_unlock(&g_mu);
    return ok;
}

static void write_cmd(const char *s) {
    FakeArray b = { (int)strlen(s), (void *)s };
    Java_com_wakil_agent_env_PtyNative_write(g_env, NULL, g_id, (jbyteArray)&b, (jint)strlen(s));
}

int main(void) {
    struct JNINativeInterface_ intf;
    memset(&intf, 0, sizeof(intf));
    intf.GetArrayLength = f_GetArrayLength;
    intf.GetObjectArrayElement = f_GetObjectArrayElement;
    intf.GetStringUTFChars = f_GetStringUTFChars;
    intf.ReleaseStringUTFChars = f_ReleaseStringUTFChars;
    intf.GetByteArrayElements = f_GetByteArrayElements;
    intf.ReleaseByteArrayElements = f_ReleaseByteArrayElements;
    JNIEnv table = &intf;
    g_env = &table;
    jclass cls = NULL;

    char *argv_items[] = {"/bin/sh", NULL};
    FakeArray argv = { 1, argv_items };
    char *envp_items[] = {"PATH=/usr/bin:/bin", "PS1=wakil:~# ", NULL};
    FakeArray envp = { 2, envp_items };

    printf("spawn...\n"); fflush(stdout);
    jint id = Java_com_wakil_agent_env_PtyNative_spawn(g_env, cls, (jobjectArray)&argv, (jobjectArray)&envp, (jstring)"/tmp", 24, 80);
    printf("id=%d\n", id);
    if (id < 0) { printf("FAIL spawn\n"); return 1; }
    g_id = id;

    pthread_t t;
    pthread_create(&t, NULL, pump, NULL);

    for (int i = 0; i < 30 && !have("wakil:~#"); i++) usleep(100 * 1000);
    printf("prompt seen: %s\n", have("wakil:~#") ? "yes" : "NO");
    if (!have("wakil:~#")) { printf("FAIL: no prompt\n"); return 2; }

    write_cmd("echo PTY_OK_123\n");
    for (int i = 0; i < 30 && !have("PTY_OK_123"); i++) usleep(100 * 1000);
    printf("round-trip seen: %s\n", have("PTY_OK_123") ? "yes" : "NO");
    if (!have("PTY_OK_123")) { printf("FAIL: echo/output missing\n"); return 3; }

    if (Java_com_wakil_agent_env_PtyNative_resize(g_env, cls, id, 30, 100) != 0) { printf("FAIL resize\n"); return 4; }
    printf("resize ok\n");

    write_cmd("exit\n");
    jint code = -99;
    for (int i = 0; i < 50; i++) {
        code = Java_com_wakil_agent_env_PtyNative_wait(g_env, cls, id);
        if (code >= 0) break;
        usleep(100 * 1000);
    }
    printf("exit code=%d\n", code);
    if (code != 0) { printf("FAIL wait (expected 0)\n"); return 5; }

    g_id = -1; /* pump sees EOF and exits */
    pthread_join(t, NULL);
    Java_com_wakil_agent_env_PtyNative_close(g_env, cls, id);
    Java_com_wakil_agent_env_PtyNative_kill(g_env, cls, id); /* after close: must be a no-op, not a crash */

    /* phase 2: kill a running session (the app's Stop button) -> 128+SIGKILL */
    char *argv2_items[] = {"/bin/sh", "-c", "sleep 30", NULL};
    FakeArray argv2 = { 3, argv2_items };
    jint id2 = Java_com_wakil_agent_env_PtyNative_spawn(g_env, cls, (jobjectArray)&argv2, (jobjectArray)&envp, (jstring)"/tmp", 24, 80);
    printf("kill-test id=%d\n", id2);
    if (id2 < 0) { printf("FAIL spawn2\n"); return 6; }
    g_id = id2;
    pthread_t t2;
    pthread_create(&t2, NULL, pump, NULL);
    usleep(300 * 1000);
    Java_com_wakil_agent_env_PtyNative_kill(g_env, cls, id2);
    jint code2 = -99;
    for (int i = 0; i < 50; i++) {
        code2 = Java_com_wakil_agent_env_PtyNative_wait(g_env, cls, id2);
        if (code2 >= 0) break;
        usleep(100 * 1000);
    }
    printf("killed exit code=%d (expect 137 = 128+SIGKILL)\n", code2);
    if (code2 != 137) { printf("FAIL kill\n"); return 7; }
    g_id = -1;
    pthread_join(t2, NULL);
    Java_com_wakil_agent_env_PtyNative_close(g_env, cls, id2);
    printf("ALL PTY SMOKE TESTS PASSED\n");
    return 0;
}
