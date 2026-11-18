/*
 * wakil_pty.c — tiny PTY bridge for Wakil (وكيل).
 *
 * Spawns a child process attached to a real pseudo-terminal so programs inside the
 * proot Linux env see isatty()==true (REPLs, y/n prompts, full-screen tools).
 * Android bionic provides openpty() in libc since API 23 (minSdk 26 — no extra lib).
 *
 * JNI surface (see com/wakil/agent/env/PtyNative.kt):
 *   spawn(argv[], envp[], cwd, rows, cols) -> session id (>=0) or negative error
 *   read(id, buf)  -> n>0 bytes, 0 = EOF (child closed tty), negative = -errno
 *   write(id, data, len) -> n bytes written or -errno
 *   resize(id, rows, cols) -> 0 or -errno (kernel sends SIGWINCH automatically)
 *   kill(id)   — SIGKILL the child (pump() sees EOF, wait() reaps)
 *   wait(id)   -> exit code (128+signal if killed) or -1
 *   close(id)  — free the session slot
 */
#include <jni.h>
#include <errno.h>
#include <fcntl.h>
#include <pty.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#define MAX_SESSIONS 4

static int g_fd[MAX_SESSIONS];
static pid_t g_pid[MAX_SESSIONS];

static int alloc_slot(void) {
    for (int i = 0; i < MAX_SESSIONS; i++) if (g_pid[i] <= 0) return i;
    return -1;
}

static char *dup_jstring(JNIEnv *env, jstring js) {
    if (js == NULL) return NULL;
    const char *s = (*env)->GetStringUTFChars(env, js, NULL);
    if (s == NULL) return NULL;
    char *copy = strdup(s);
    (*env)->ReleaseStringUTFChars(env, js, s);
    return copy;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_env_PtyNative_spawn(JNIEnv *env, jclass cls,
        jobjectArray jargv, jobjectArray jenvp, jstring jcwd, jint rows, jint cols) {
    (void)cls;
    if (jargv == NULL || jcwd == NULL) return -100;
    int argc = (*env)->GetArrayLength(env, jargv);
    if (argc < 1) return -100;

    char **argv = calloc((size_t)argc + 1, sizeof(char *));
    if (argv == NULL) return -101;
    for (int i = 0; i < argc; i++) {
        argv[i] = dup_jstring(env, (jstring)(*env)->GetObjectArrayElement(env, jargv, i));
        if (argv[i] == NULL) { for (int k = 0; k < i; k++) free(argv[k]); free(argv); return -101; }
    }

    int envc = jenvp == NULL ? 0 : (*env)->GetArrayLength(env, jenvp);
    char **envp = calloc((size_t)envc + 1, sizeof(char *));
    if (envp == NULL) {
        for (int i = 0; i < argc; i++) free(argv[i]);
        free(argv);
        return -102;
    }
    for (int i = 0; i < envc; i++) {
        envp[i] = dup_jstring(env, (jstring)(*env)->GetObjectArrayElement(env, jenvp, i));
        if (envp[i] == NULL) { for (int k = 0; k < i; k++) free(envp[k]); free(envp); free(argv); return -102; }
    }

    char *cwd = dup_jstring(env, jcwd);
    if (cwd == NULL) {
        for (int i = 0; i < argc; i++) free(argv[i]);
        free(argv);
        for (int i = 0; i < envc; i++) free(envp[i]);
        free(envp);
        return -101;
    }

    int mfd = -1, sfd = -1;
    if (openpty(&mfd, &sfd, NULL, NULL, NULL) < 0) {
        int err = -errno;
        for (int i = 0; i < argc; i++) free(argv[i]);
        free(argv);
        for (int i = 0; i < envc; i++) free(envp[i]);
        free(envp);
        free(cwd);
        return err;
    }

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = rows > 0 ? (unsigned short)rows : 24;
    ws.ws_col = cols > 0 ? (unsigned short)cols : 80;
    ioctl(sfd, TIOCSWINSZ, &ws);

    pid_t pid = fork();
    if (pid < 0) {
        int err = -errno;
        close(mfd); close(sfd);
        for (int i = 0; i < argc; i++) free(argv[i]);
        free(argv);
        for (int i = 0; i < envc; i++) free(envp[i]);
        free(envp);
        free(cwd);
        return err;
    }
    if (pid == 0) {
        /* child: new session, controlling tty, stdio on the slave, then exec */
        close(mfd);
        setsid();
        ioctl(sfd, TIOCSCTTY, NULL);
        dup2(sfd, 0); dup2(sfd, 1); dup2(sfd, 2);
        if (sfd > 2) close(sfd);
        if (chdir(cwd) != 0) { /* /root always exists; keep going */ }
        execve(argv[0], argv, envp);
        _exit(127); /* exec failed */
    }

    close(sfd);
    for (int i = 0; i < argc; i++) free(argv[i]);
    free(argv);
    for (int i = 0; i < envc; i++) free(envp[i]);
    free(envp);
    free(cwd);

    int id = alloc_slot();
    if (id < 0) { kill(pid, SIGKILL); return -105; }
    g_fd[id] = mfd;
    g_pid[id] = pid;
    return id;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_env_PtyNative_read(JNIEnv *env, jclass cls, jint id, jbyteArray jbuf) {
    (void)cls;
    if (id < 0 || id >= MAX_SESSIONS || g_pid[id] <= 0 || g_fd[id] < 0) return -200;
    if (jbuf == NULL) return -201;
    jsize cap = (*env)->GetArrayLength(env, jbuf);
    if (cap <= 0) return 0;
    jbyte *buf = (*env)->GetByteArrayElements(env, jbuf, NULL);
    if (buf == NULL) return -202;
    ssize_t n;
    do { n = read(g_fd[id], buf, (size_t)cap); } while (n < 0 && errno == EINTR);
    (*env)->ReleaseByteArrayElements(env, jbuf, buf, 0);
    if (n > 0) return (jint)n;
    if (n == 0) return 0;
    return (errno == EIO || errno == EPROTO) ? 0 : -errno; /* EIO = tty side closed -> EOF */
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_env_PtyNative_write(JNIEnv *env, jclass cls, jint id,
        jbyteArray jbuf, jint len) {
    (void)cls;
    if (id < 0 || id >= MAX_SESSIONS || g_pid[id] <= 0 || g_fd[id] < 0) return -200;
    if (jbuf == NULL) return -201;
    jsize cap = (*env)->GetArrayLength(env, jbuf);
    if (len < 0 || len > cap) return -201;
    if (len == 0) return 0;
    jbyte *buf = (*env)->GetByteArrayElements(env, jbuf, NULL);
    if (buf == NULL) return -202;
    ssize_t n;
    do { n = write(g_fd[id], buf, (size_t)len); } while (n < 0 && errno == EINTR);
    (*env)->ReleaseByteArrayElements(env, jbuf, buf, 0);
    return n < 0 ? -errno : (jint)n;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_env_PtyNative_resize(JNIEnv *env, jclass cls,
        jint id, jint rows, jint cols) {
    (void)env; (void)cls;
    if (id < 0 || id >= MAX_SESSIONS || g_pid[id] <= 0 || g_fd[id] < 0) return -200;
    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = rows > 0 ? (unsigned short)rows : 24;
    ws.ws_col = cols > 0 ? (unsigned short)cols : 80;
    return ioctl(g_fd[id], TIOCSWINSZ, &ws) < 0 ? -errno : 0;
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_env_PtyNative_kill(JNIEnv *env, jclass cls, jint id) {
    (void)env; (void)cls;
    if (id < 0 || id >= MAX_SESSIONS || g_pid[id] <= 0) return;
    kill(g_pid[id], SIGKILL);
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_env_PtyNative_wait(JNIEnv *env, jclass cls, jint id) {
    (void)env; (void)cls;
    if (id < 0 || id >= MAX_SESSIONS || g_pid[id] <= 0) return -1;
    int status = 0;
    pid_t r = waitpid(g_pid[id], &status, 0);
    if (r < 0) return -1;
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return -1;
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_env_PtyNative_close(JNIEnv *env, jclass cls, jint id) {
    (void)env; (void)cls;
    if (id < 0 || id >= MAX_SESSIONS) return;
    if (g_fd[id] >= 0) { close(g_fd[id]); g_fd[id] = -1; }
    g_pid[id] = 0;
}
