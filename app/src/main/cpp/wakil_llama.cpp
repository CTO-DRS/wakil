// Wakil - minimal JNI bridge over llama.cpp
// Exposes: backend init, model load/free, chat template application, streaming generation
// with KV-cache prefix reuse (so multi-step agent turns don't re-process the whole prompt).
#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <atomic>
#include <mutex>
#include <algorithm>
#include "llama.h"

#define TAG "WakilLlama"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

struct WakilModel {
    llama_model *model = nullptr;
    llama_context *ctx = nullptr;
    const llama_vocab *vocab = nullptr;
    std::vector<llama_token> cached;   // tokens currently in the KV cache (seq 0)
    std::atomic<bool> abort{false};
    std::mutex mu;
    int lookup = 8;      // max draft tokens for prompt-lookup speculative decoding (0 = off)
    long drafted = 0, accepted = 0;
};

// Prompt-lookup decoding: find the most recent earlier occurrence of the last n tokens and propose
// the tokens that followed it. Agents copy a lot (JSON keys, file paths, tool output), so many drafts
// are accepted, and checking k drafted tokens in one batch costs about the same as decoding one.
static void find_draft(const std::vector<llama_token> &h, int maxd, std::vector<llama_token> &out) {
    out.clear();
    if (maxd <= 0) return;
    const int n = (int) h.size();
    const int lo = std::max(0, n - 6000);
    for (int ng = 4; ng >= 2; --ng) {
        if (n < ng + 1) continue;
        for (int i = n - ng - 1; i >= lo; --i) {
            bool m = true;
            for (int j = 0; j < ng; ++j) if (h[i + j] != h[n - ng + j]) { m = false; break; }
            if (!m) continue;
            for (int j = i + ng; j < n && (int) out.size() < maxd; ++j) out.push_back(h[j]);
            if (!out.empty()) return;
        }
    }
}

static std::string jstr(JNIEnv *env, jstring s) {
    if (!s) return {};
    const char *c = env->GetStringUTFChars(s, nullptr);
    std::string r(c);
    env->ReleaseStringUTFChars(s, c);
    return r;
}

// Java strings -> UTF-8 bytes properly (GetStringUTFChars gives modified UTF-8, which
// breaks 4-byte chars like emoji). We pass byte[] from Kotlin instead for content.
static std::string jbytes(JNIEnv *env, jbyteArray a) {
    if (!a) return {};
    jsize n = env->GetArrayLength(a);
    std::string r((size_t) n, '\0');
    env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte *>(&r[0]));
    return r;
}

static jbyteArray tobytes(JNIEnv *env, const std::string &s) {
    jbyteArray a = env->NewByteArray((jsize) s.size());
    env->SetByteArrayRegion(a, 0, (jsize) s.size(), reinterpret_cast<const jbyte *>(s.data()));
    return a;
}

// length of the longest prefix of s that ends on a complete UTF-8 sequence
static size_t utf8_complete_prefix(const std::string &s) {
    size_t n = s.size();
    if (n == 0) return 0;
    // look back up to 3 bytes for a lead byte
    for (size_t back = 1; back <= 4 && back <= n; ++back) {
        unsigned char c = (unsigned char) s[n - back];
        if ((c & 0xC0) == 0x80) continue;          // continuation byte
        size_t need = 1;
        if ((c & 0xE0) == 0xC0) need = 2;
        else if ((c & 0xF0) == 0xE0) need = 3;
        else if ((c & 0xF8) == 0xF0) need = 4;
        return (back >= need) ? n : n - back;
    }
    return n;
}

static void log_cb(ggml_log_level level, const char *text, void *) {
    if (level >= GGML_LOG_LEVEL_WARN) __android_log_print(ANDROID_LOG_WARN, TAG, "%s", text);
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_wakil_agent_llm_LlamaNative_backendInit(JNIEnv *, jclass) {
    llama_log_set(log_cb, nullptr);
    llama_backend_init();
}

JNIEXPORT jstring JNICALL
Java_com_wakil_agent_llm_LlamaNative_systemInfo(JNIEnv *env, jclass) {
    return env->NewStringUTF(llama_print_system_info());
}

JNIEXPORT jlong JNICALL
Java_com_wakil_agent_llm_LlamaNative_loadModel(JNIEnv *env, jclass, jstring jpath, jint nCtx, jint nThreads, jint nGpuLayers) {
    std::string path = jstr(env, jpath);
    auto mp = llama_model_default_params();
    // 0 = CPU only (the safe default); > 0 offloads that many layers via the Vulkan backend
    // (when the native lib was built with GGML_VULKAN and the device has a working driver).
    mp.n_gpu_layers = nGpuLayers;
    llama_model *model = llama_model_load_from_file(path.c_str(), mp);
    if (!model) { LOGE("failed to load model %s", path.c_str()); return 0; }
    auto cp = llama_context_default_params();
    cp.n_ctx = nCtx > 0 ? (uint32_t) nCtx : 4096;
    cp.n_batch = 512;
    cp.n_ubatch = 512;
    cp.n_threads = nThreads > 0 ? nThreads : 4;
    cp.n_threads_batch = cp.n_threads;
    // Speed: flash attention (auto: on when the model supports it) + 8-bit KV cache (half the memory
    // traffic of f16 per generated token). Fall back to plain settings if this model rejects them.
    cp.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_AUTO;
    cp.type_k = GGML_TYPE_Q8_0;
    cp.type_v = GGML_TYPE_Q8_0;
    llama_context *ctx = llama_init_from_model(model, cp);
    if (!ctx) {
        LOGI("fast context rejected, retrying with f16 KV");
        cp.type_k = GGML_TYPE_F16;
        cp.type_v = GGML_TYPE_F16;
        ctx = llama_init_from_model(model, cp);
    }
    if (!ctx) { LOGE("failed to create context"); llama_model_free(model); return 0; }
    auto *w = new WakilModel();
    w->model = model;
    w->ctx = ctx;
    w->vocab = llama_model_get_vocab(model);
    LOGI("model loaded, n_ctx=%u, gpu_layers=%d", llama_n_ctx(ctx), (int) mp.n_gpu_layers);
    return reinterpret_cast<jlong>(w);
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_llm_LlamaNative_freeModel(JNIEnv *, jclass, jlong h) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return;
    w->abort = true;
    std::lock_guard<std::mutex> lk(w->mu);
    if (w->ctx) llama_free(w->ctx);
    if (w->model) llama_model_free(w->model);
    delete w;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_llm_LlamaNative_contextSize(JNIEnv *, jclass, jlong h) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    return w ? (jint) llama_n_ctx(w->ctx) : 0;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_llm_LlamaNative_countTokens(JNIEnv *env, jclass, jlong h, jbyteArray text) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return -1;
    std::string s = jbytes(env, text);
    int n = -llama_tokenize(w->vocab, s.c_str(), (int32_t) s.size(), nullptr, 0, true, true);
    return n;
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_llm_LlamaNative_abort(JNIEnv *, jclass, jlong h) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (w) w->abort = true;
}

// roles/contents are arrays of UTF-8 byte arrays. Returns formatted prompt bytes or null.
JNIEXPORT jbyteArray JNICALL
Java_com_wakil_agent_llm_LlamaNative_applyTemplate(JNIEnv *env, jclass, jlong h, jobjectArray roles,
                                                     jobjectArray contents, jboolean addAss) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return nullptr;
    jsize n = env->GetArrayLength(roles);
    std::vector<std::string> r(n), c(n);
    std::vector<llama_chat_message> msgs(n);
    size_t total = 0;
    for (jsize i = 0; i < n; ++i) {
        r[i] = jbytes(env, (jbyteArray) env->GetObjectArrayElement(roles, i));
        c[i] = jbytes(env, (jbyteArray) env->GetObjectArrayElement(contents, i));
        total += r[i].size() + c[i].size();
    }
    for (jsize i = 0; i < n; ++i) msgs[i] = {r[i].c_str(), c[i].c_str()};
    const char *tmpl = llama_model_chat_template(w->model, nullptr);
    std::string buf(total * 2 + 1024, '\0');
    int len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), addAss, &buf[0], (int32_t) buf.size());
    if (len > (int) buf.size()) {
        buf.resize(len + 16);
        len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), addAss, &buf[0], (int32_t) buf.size());
    }
    if (len < 0) {
        // Fallback: ChatML (works for Qwen family and many others)
        LOGE("chat template not supported, falling back to chatml");
        tmpl = "chatml";
        len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), addAss, &buf[0], (int32_t) buf.size());
        if (len > (int) buf.size()) {
            buf.resize(len + 16);
            len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), addAss, &buf[0], (int32_t) buf.size());
        }
        if (len < 0) return nullptr;
    }
    buf.resize(len);
    return tobytes(env, buf);
}

// Streaming generation. callback: object with method `boolean onBytes(byte[])` (return false to stop).
// Returns number of generated tokens, or negative error:
//  -1 bad handle, -2 prompt too long for context, -3 decode failure
JNIEXPORT jint JNICALL
Java_com_wakil_agent_llm_LlamaNative_generate(JNIEnv *env, jclass, jlong h, jbyteArray jprompt, jint maxTokens,
                                               jfloat temp, jfloat topP, jobject callback) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return -1;
    std::lock_guard<std::mutex> lk(w->mu);
    w->abort = false;
    jclass cbCls = env->GetObjectClass(callback);
    jmethodID onBytes = env->GetMethodID(cbCls, "onBytes", "([B)Z");

    std::string prompt = jbytes(env, jprompt);
    int n_prompt = -llama_tokenize(w->vocab, prompt.c_str(), (int32_t) prompt.size(), nullptr, 0, true, true);
    std::vector<llama_token> toks(std::max(n_prompt, 1));
    if (llama_tokenize(w->vocab, prompt.c_str(), (int32_t) prompt.size(), toks.data(), (int32_t) toks.size(), true, true) < 0)
        return -3;
    toks.resize(n_prompt);
    const int n_ctx = (int) llama_n_ctx(w->ctx);
    if (n_prompt + 8 >= n_ctx) return -2;
    if (maxTokens > n_ctx - n_prompt - 1) maxTokens = n_ctx - n_prompt - 1;

    // prefix reuse
    size_t common = 0;
    while (common < w->cached.size() && common < toks.size() && w->cached[common] == toks[common]) ++common;
    if (common == toks.size() && common > 0) --common; // need at least one token to get logits
    llama_memory_t mem = llama_get_memory(w->ctx);
    if (!llama_memory_seq_rm(mem, 0, (llama_pos) common, -1)) {
        llama_memory_clear(mem, true);
        common = 0;
    }
    w->cached.resize(common);

    const int n_batch = (int) llama_n_batch(w->ctx);
    for (size_t i = common; i < toks.size(); i += n_batch) {
        if (w->abort) return 0;
        int n = (int) std::min((size_t) n_batch, toks.size() - i);
        llama_batch b = llama_batch_get_one(&toks[i], n);
        if (llama_decode(w->ctx, b) != 0) {
            LOGE("decode failed at prompt chunk %zu", i);
            llama_memory_clear(mem, true);
            w->cached.clear();
            return -3;
        }
        w->cached.insert(w->cached.end(), toks.begin() + i, toks.begin() + i + n);
    }

    auto sp = llama_sampler_chain_default_params();
    llama_sampler *smpl = llama_sampler_chain_init(sp);
    llama_sampler_chain_add(smpl, llama_sampler_init_penalties(llama_vocab_n_tokens(w->vocab), 64, 1.08f, 0.0f, 0.0f));
    if (temp <= 0.0f) {
        llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
    } else {
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(topP > 0 ? topP : 0.9f, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05f, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    }

    std::string pending;
    int generated = 0;
    bool stop = false;
    char piece[256];
    auto emit = [&](llama_token t) {
        int np = llama_token_to_piece(w->vocab, t, piece, sizeof(piece), 0, false);
        if (np > 0) pending.append(piece, np);
        size_t ok = utf8_complete_prefix(pending);
        if (ok > 0) {
            jbyteArray arr = tobytes(env, pending.substr(0, ok));
            jboolean cont = env->CallBooleanMethod(callback, onBytes, arr);
            env->DeleteLocalRef(arr);
            pending.erase(0, ok);
            if (!cont) w->abort = true;
        }
        ++generated;
    };
    std::vector<llama_token> draft, hist;
    llama_batch batch = llama_batch_init(w->lookup + 1, 0, 1);
    llama_token id = llama_sampler_sample(smpl, w->ctx, -1);
    while (!stop && generated < maxTokens && !w->abort) {
        if (llama_vocab_is_eog(w->vocab, id)) break;
        emit(id);
        if (generated >= maxTokens || w->abort) break;
        hist = w->cached; hist.push_back(id);
        int room = std::min(w->lookup, std::min(maxTokens - generated, n_ctx - (int) hist.size() - 2));
        find_draft(hist, std::max(room, 0), draft);
        const int k = (int) draft.size();
        batch.n_tokens = 0;
        const llama_pos base = (llama_pos) w->cached.size();
        for (int i = 0; i <= k; ++i) {
            batch.token[i] = i == 0 ? id : draft[i - 1];
            batch.pos[i] = base + i;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i] = true;
            batch.n_tokens++;
        }
        if (llama_decode(w->ctx, batch) != 0) { LOGE("decode failed during generation"); break; }
        w->cached.push_back(id);
        llama_token next = -1;
        int i = 0;
        for (; i < k; ++i) {
            llama_token t = llama_sampler_sample(smpl, w->ctx, i);
            if (t != draft[i]) { next = t; break; }
            // accepted draft token: its KV entry is already in place
            w->cached.push_back(t);
            if (llama_vocab_is_eog(w->vocab, t)) { stop = true; w->cached.pop_back(); break; }
            emit(t);
            if (generated >= maxTokens || w->abort) { stop = true; ++i; break; }
        }
        w->drafted += k; w->accepted += std::min(i, k);
        if (!stop && next < 0) next = llama_sampler_sample(smpl, w->ctx, k);
        // drop KV entries of rejected drafts
        llama_memory_seq_rm(mem, 0, (llama_pos) w->cached.size(), -1);
        id = next;
    }
    llama_batch_free(batch);
    if (!pending.empty()) {
        jbyteArray arr = tobytes(env, pending);
        env->CallBooleanMethod(callback, onBytes, arr);
        env->DeleteLocalRef(arr);
    }
    llama_sampler_free(smpl);
    return generated;
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_llm_LlamaNative_setLookup(JNIEnv *, jclass, jlong h, jint n) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (w) { std::lock_guard<std::mutex> lk(w->mu); w->lookup = std::max(0, std::min((int) n, 16)); }
}

// accepted * 1000 / drafted (per mille), or -1 when nothing was drafted yet
JNIEXPORT jint JNICALL
Java_com_wakil_agent_llm_LlamaNative_lookupRate(JNIEnv *, jclass, jlong h) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w || w->drafted == 0) return -1;
    return (jint) (w->accepted * 1000 / w->drafted);
}

// Saves / restores the KV cache (system prompt + chat so far) so the first reply after reopening
// the app does not re-read the long tool prompt.
JNIEXPORT jboolean JNICALL
Java_com_wakil_agent_llm_LlamaNative_saveCache(JNIEnv *env, jclass, jlong h, jstring jpath) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w || w->cached.empty()) return JNI_FALSE;
    std::lock_guard<std::mutex> lk(w->mu);
    std::string path = jstr(env, jpath);
    return llama_state_seq_save_file(w->ctx, path.c_str(), 0, w->cached.data(), w->cached.size()) > 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_wakil_agent_llm_LlamaNative_loadCache(JNIEnv *env, jclass, jlong h, jstring jpath) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return 0;
    std::lock_guard<std::mutex> lk(w->mu);
    std::string path = jstr(env, jpath);
    std::vector<llama_token> t(llama_n_ctx(w->ctx));
    size_t n = 0;
    llama_memory_t mem = llama_get_memory(w->ctx);
    llama_memory_clear(mem, true);
    if (llama_state_seq_load_file(w->ctx, path.c_str(), 0, t.data(), t.size(), &n) == 0) {
        llama_memory_clear(mem, true);
        w->cached.clear();
        return 0;
    }
    t.resize(n);
    w->cached = t;
    return (jint) n;
}

JNIEXPORT void JNICALL
Java_com_wakil_agent_llm_LlamaNative_resetCache(JNIEnv *, jclass, jlong h) {
    auto *w = reinterpret_cast<WakilModel *>(h);
    if (!w) return;
    std::lock_guard<std::mutex> lk(w->mu);
    llama_memory_clear(llama_get_memory(w->ctx), true);
    w->cached.clear();
}

} // extern "C"
