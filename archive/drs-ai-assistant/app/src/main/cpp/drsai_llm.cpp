// DRS AI — JNI bridge to llama.cpp.
// Copyright (c) 2026 رشيد / CTO-DRS. MIT License.
//
// Design: one native Session per loaded model. All calls for a session are made
// from a single Kotlin thread, so no locking is needed here. Generation is
// pull-based: Kotlin calls nextToken() in a loop, which makes streaming and
// stopping trivial on the Kotlin side.

#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <string>
#include <vector>

#include "llama.h"

#define TAG "DrsLlm"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace {

struct Session {
    llama_model *model = nullptr;
    llama_context *ctx = nullptr;
    llama_sampler *sampler = nullptr;
    const llama_vocab *vocab = nullptr;
    std::vector<llama_token> cached;  // tokens currently held in the KV cache
    int n_ctx = 0;
    int n_batch = 512;
};

void log_callback(ggml_log_level level, const char *text, void *) {
    int prio = ANDROID_LOG_DEBUG;
    if (level == GGML_LOG_LEVEL_ERROR) prio = ANDROID_LOG_ERROR;
    else if (level == GGML_LOG_LEVEL_WARN) prio = ANDROID_LOG_WARN;
    else if (level == GGML_LOG_LEVEL_INFO) prio = ANDROID_LOG_INFO;
    __android_log_write(prio, TAG, text);
}

Session *as_session(jlong handle) { return reinterpret_cast<Session *>(handle); }

std::string to_std(JNIEnv *env, jstring s) {
    if (s == nullptr) return {};
    // GetStringUTFChars returns *modified* UTF-8; go through UTF-16 -> bytes via String.getBytes.
    jclass cls = env->GetObjectClass(s);
    jmethodID get_bytes = env->GetMethodID(cls, "getBytes", "(Ljava/lang/String;)[B");
    jstring charset = env->NewStringUTF("UTF-8");
    auto arr = (jbyteArray) env->CallObjectMethod(s, get_bytes, charset);
    jsize len = env->GetArrayLength(arr);
    std::string out(static_cast<size_t>(len), '\0');
    env->GetByteArrayRegion(arr, 0, len, reinterpret_cast<jbyte *>(out.data()));
    env->DeleteLocalRef(arr);
    env->DeleteLocalRef(charset);
    env->DeleteLocalRef(cls);
    return out;
}

jstring to_jstring(JNIEnv *env, const std::string &s) {
    jbyteArray arr = env->NewByteArray(static_cast<jsize>(s.size()));
    env->SetByteArrayRegion(arr, 0, static_cast<jsize>(s.size()), reinterpret_cast<const jbyte *>(s.data()));
    jclass str_cls = env->FindClass("java/lang/String");
    jmethodID ctor = env->GetMethodID(str_cls, "<init>", "([BLjava/lang/String;)V");
    jstring charset = env->NewStringUTF("UTF-8");
    auto out = (jstring) env->NewObject(str_cls, ctor, arr, charset);
    env->DeleteLocalRef(arr);
    env->DeleteLocalRef(charset);
    env->DeleteLocalRef(str_cls);
    return out;
}

std::vector<llama_token> tokenize(const llama_vocab *vocab, const std::string &text, bool add_special) {
    int n = -llama_tokenize(vocab, text.data(), (int32_t) text.size(), nullptr, 0, add_special, true);
    if (n <= 0) return {};
    std::vector<llama_token> tokens(static_cast<size_t>(n));
    int got = llama_tokenize(vocab, text.data(), (int32_t) text.size(), tokens.data(), n, add_special, true);
    if (got < 0) return {};
    tokens.resize(static_cast<size_t>(got));
    return tokens;
}

void rebuild_sampler(Session *s, float temperature, float top_p, int top_k, float repeat_penalty, uint32_t seed) {
    if (s->sampler) llama_sampler_free(s->sampler);
    s->sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(s->sampler, llama_sampler_init_penalties(llama_vocab_n_tokens(s->vocab), 64, repeat_penalty, 0.0f, 0.0f));
    if (temperature <= 0.0f) {
        llama_sampler_chain_add(s->sampler, llama_sampler_init_greedy());
        return;
    }
    llama_sampler_chain_add(s->sampler, llama_sampler_init_top_k(top_k));
    llama_sampler_chain_add(s->sampler, llama_sampler_init_top_p(top_p, 1));
    llama_sampler_chain_add(s->sampler, llama_sampler_init_min_p(0.05f, 1));
    llama_sampler_chain_add(s->sampler, llama_sampler_init_temp(temperature));
    llama_sampler_chain_add(s->sampler, llama_sampler_init_dist(seed));
}

}  // namespace

#define JNI_FN(name) Java_com_drsai_assistant_llm_LlamaNative_##name

extern "C" {

JNIEXPORT void JNICALL JNI_FN(nativeInit)(JNIEnv *, jobject) {
    llama_log_set(log_callback, nullptr);
    llama_backend_init();
    LOGI("llama backend initialised");
}

JNIEXPORT jlong JNICALL JNI_FN(nativeLoad)(JNIEnv *env, jobject, jstring jpath, jint n_ctx, jint n_threads) {
    std::string path = to_std(env, jpath);
    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;
    mparams.load_mode = LLAMA_LOAD_MODE_MMAP;
    llama_model *model = llama_model_load_from_file(path.c_str(), mparams);
    if (!model) {
        LOGE("failed to load model: %s", path.c_str());
        return 0;
    }
    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = (uint32_t) n_ctx;
    cparams.n_batch = 512;
    cparams.n_ubatch = 512;
    cparams.n_threads = n_threads;
    cparams.n_threads_batch = n_threads;
    llama_context *ctx = llama_init_from_model(model, cparams);
    if (!ctx) {
        LOGE("failed to create context");
        llama_model_free(model);
        return 0;
    }
    auto *s = new Session();
    s->model = model;
    s->ctx = ctx;
    s->vocab = llama_model_get_vocab(model);
    s->n_ctx = (int) llama_n_ctx(ctx);
    s->n_batch = 512;
    rebuild_sampler(s, 0.7f, 0.9f, 40, 1.1f, LLAMA_DEFAULT_SEED);
    LOGI("model loaded, n_ctx=%d threads=%d", s->n_ctx, n_threads);
    return reinterpret_cast<jlong>(s);
}

JNIEXPORT void JNICALL JNI_FN(nativeFree)(JNIEnv *, jobject, jlong handle) {
    Session *s = as_session(handle);
    if (!s) return;
    if (s->sampler) llama_sampler_free(s->sampler);
    if (s->ctx) llama_free(s->ctx);
    if (s->model) llama_model_free(s->model);
    delete s;
}

JNIEXPORT jint JNICALL JNI_FN(nativeContextSize)(JNIEnv *, jobject, jlong handle) {
    Session *s = as_session(handle);
    return s ? s->n_ctx : 0;
}

JNIEXPORT jstring JNICALL JNI_FN(nativeChatTemplate)(JNIEnv *env, jobject, jlong handle) {
    Session *s = as_session(handle);
    if (!s) return nullptr;
    const char *tmpl = llama_model_chat_template(s->model, nullptr);
    return tmpl ? to_jstring(env, tmpl) : nullptr;
}

// Formats a conversation with the chat template stored in the GGUF metadata.
// Returns null when the model has no template or llama.cpp does not recognise it.
JNIEXPORT jstring JNICALL JNI_FN(nativeApplyTemplate)(JNIEnv *env, jobject, jlong handle,
                                                     jobjectArray jroles, jobjectArray jcontents,
                                                     jboolean add_assistant) {
    Session *s = as_session(handle);
    if (!s) return nullptr;
    const char *tmpl = llama_model_chat_template(s->model, nullptr);
    if (!tmpl) return nullptr;

    jsize n = env->GetArrayLength(jroles);
    std::vector<std::string> roles, contents;
    roles.reserve(n);
    contents.reserve(n);
    size_t total = 0;
    for (jsize i = 0; i < n; ++i) {
        auto r = (jstring) env->GetObjectArrayElement(jroles, i);
        auto c = (jstring) env->GetObjectArrayElement(jcontents, i);
        roles.push_back(to_std(env, r));
        contents.push_back(to_std(env, c));
        total += contents.back().size();
        env->DeleteLocalRef(r);
        env->DeleteLocalRef(c);
    }
    std::vector<llama_chat_message> msgs;
    msgs.reserve(n);
    for (jsize i = 0; i < n; ++i) msgs.push_back({roles[i].c_str(), contents[i].c_str()});

    std::vector<char> buf(total * 2 + 1024);
    int32_t len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), add_assistant, buf.data(), (int32_t) buf.size());
    if (len < 0) return nullptr;
    if ((size_t) len > buf.size()) {
        buf.resize((size_t) len);
        len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), add_assistant, buf.data(), (int32_t) buf.size());
        if (len < 0) return nullptr;
    }
    return to_jstring(env, std::string(buf.data(), (size_t) len));
}

JNIEXPORT jint JNICALL JNI_FN(nativeTokenCount)(JNIEnv *env, jobject, jlong handle, jstring jtext) {
    Session *s = as_session(handle);
    if (!s) return -1;
    return (jint) tokenize(s->vocab, to_std(env, jtext), true).size();
}

// Evaluates the prompt, reusing the longest matching prefix already in the KV cache.
// Returns the number of prompt tokens, or a negative error code:
//   -1 tokenisation failed, -2 prompt does not fit in the context, -3 decode failed.
JNIEXPORT jint JNICALL JNI_FN(nativeBeginCompletion)(JNIEnv *env, jobject, jlong handle, jstring jprompt,
                                                    jfloat temperature, jfloat top_p, jint top_k,
                                                    jfloat repeat_penalty, jint seed) {
    Session *s = as_session(handle);
    if (!s) return -1;
    std::vector<llama_token> tokens = tokenize(s->vocab, to_std(env, jprompt), true);
    if (tokens.empty()) return -1;
    if ((int) tokens.size() >= s->n_ctx - 8) return -2;

    size_t keep = 0;
    while (keep < s->cached.size() && keep < tokens.size() && s->cached[keep] == tokens[keep]) ++keep;
    if (keep == tokens.size()) --keep;  // always decode at least one token to get fresh logits

    llama_memory_t mem = llama_get_memory(s->ctx);
    if (!llama_memory_seq_rm(mem, 0, (llama_pos) keep, -1)) {
        llama_memory_clear(mem, true);
        keep = 0;
    }
    s->cached.resize(keep);

    for (size_t i = keep; i < tokens.size(); i += (size_t) s->n_batch) {
        int32_t n = (int32_t) std::min((size_t) s->n_batch, tokens.size() - i);
        llama_batch batch = llama_batch_get_one(tokens.data() + i, n);
        if (llama_decode(s->ctx, batch) != 0) {
            LOGE("prompt decode failed at %zu", i);
            llama_memory_clear(mem, true);
            s->cached.clear();
            return -3;
        }
        s->cached.insert(s->cached.end(), tokens.begin() + (long) i, tokens.begin() + (long) i + n);
    }
    rebuild_sampler(s, temperature, top_p, top_k, repeat_penalty,
                    seed < 0 ? LLAMA_DEFAULT_SEED : (uint32_t) seed);
    LOGI("prompt: %zu tokens, %zu reused from cache", tokens.size(), keep);
    return (jint) tokens.size();
}

// Samples and evaluates one token. Returns its raw UTF-8 bytes (possibly an incomplete
// multi-byte sequence — Kotlin reassembles them), or null at end-of-generation.
JNIEXPORT jbyteArray JNICALL JNI_FN(nativeNextToken)(JNIEnv *env, jobject, jlong handle) {
    Session *s = as_session(handle);
    if (!s) return nullptr;
    if ((int) s->cached.size() >= s->n_ctx - 1) return nullptr;

    llama_token tok = llama_sampler_sample(s->sampler, s->ctx, -1);
    if (llama_vocab_is_eog(s->vocab, tok)) return nullptr;

    std::vector<char> piece(64);
    int32_t n = llama_token_to_piece(s->vocab, tok, piece.data(), (int32_t) piece.size(), 0, false);
    if (n < 0) {
        piece.resize((size_t) -n);
        n = llama_token_to_piece(s->vocab, tok, piece.data(), (int32_t) piece.size(), 0, false);
    }
    if (n < 0) n = 0;

    llama_batch batch = llama_batch_get_one(&tok, 1);
    if (llama_decode(s->ctx, batch) != 0) {
        LOGE("token decode failed");
        return nullptr;
    }
    s->cached.push_back(tok);

    jbyteArray out = env->NewByteArray(n);
    if (n > 0) env->SetByteArrayRegion(out, 0, n, reinterpret_cast<const jbyte *>(piece.data()));
    return out;
}

JNIEXPORT void JNICALL JNI_FN(nativeResetCache)(JNIEnv *, jobject, jlong handle) {
    Session *s = as_session(handle);
    if (!s) return;
    llama_memory_clear(llama_get_memory(s->ctx), true);
    s->cached.clear();
}

}  // extern "C"
