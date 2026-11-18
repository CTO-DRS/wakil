// Copyright (c) 2026 DRS AI. All rights reserved.
import { deriveBotState, type BotState } from '../components/rafeeqBotState';
import { useChatStore } from '../store/chatStore';
import { useLlmStore } from '../store/llmStore';
import { useActiveDownload } from './useActiveDownload';

/** Live mascot state from the chat engine, model loader and downloads. */
export function useBotState({ includeChatError = false } = {}): { state: BotState; progress: number } {
  const generating = useChatStore((s) => s.generating);
  const streamHasText = useChatStore((s) =>
    s.streamingMessageId ? (s.messages.find((m) => m.id === s.streamingMessageId)?.content.length ?? 0) > 0 : false,
  );
  const chatError = useChatStore((s) => s.error);
  const llmStatus = useLlmStore((s) => s.status);
  const download = useActiveDownload();
  const state = deriveBotState({
    generating,
    streamHasText,
    modelLoading: llmStatus === 'loading',
    error: llmStatus === 'error' || (includeChatError && !!chatError),
    downloadProgress: download?.status === 'downloading' ? download.ratio : null,
  });
  return { state, progress: download?.ratio ?? 0 };
}
