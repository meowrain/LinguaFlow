/**
 * 单词发音工具 — 直接使用有道词典语音 URL，无需 API 调用
 */

const audioCache = new Map<string, HTMLAudioElement>();

/** 有道词典语音 URL */
export function getWordAudioURL(word: string, accent: 'uk' | 'us'): string {
  const type = accent === 'uk' ? '1' : '2';
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

/** 预加载音频到缓存 */
export function preloadAudio(word: string, accent: 'uk' | 'us'): HTMLAudioElement {
  const key = `${word}_${accent}`;
  let audio = audioCache.get(key);
  if (audio) return audio;
  audio = new Audio(getWordAudioURL(word, accent));
  audio.preload = 'auto';
  audio.load();
  audioCache.set(key, audio);
  return audio;
}

/** 播放单词发音 */
export async function playWordAudio(word: string, accent: 'uk' | 'us' = 'us'): Promise<void> {
  const audio = preloadAudio(word, accent);
  audio.currentTime = 0;
  try {
    await audio.play();
  } catch {
    // 静默失败
  }
}

/** 批量预加载接下来 N 个单词的音频 */
export function preloadUpcoming(words: string[], accent: 'uk' | 'us' = 'us', count = 3): void {
  words.slice(0, count).forEach((w) => preloadAudio(w, accent));
}
