import { VideoSubtitle } from '@/types';

export type PlaybackVideoSubtitle = VideoSubtitle & {
  playback_generated?: boolean;
};

const MIN_DURATION_FOR_FALLBACK = 30;
const MAX_COMPRESSED_SPAN_SECONDS = 5;
const MAX_SUBTITLE_WORDS = 32;
const TARGET_SUBTITLE_WORDS = 24;
const MAX_SUBTITLE_RUNES = 220;

export function normalizeVideoSubtitlesForPlayback(
  subtitles: VideoSubtitle[],
  durationSeconds: number
): PlaybackVideoSubtitle[] {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const sorted = subtitles
    .filter((subtitle) => subtitle.text.trim())
    .map((subtitle) => ({ ...subtitle }))
    .sort((a, b) => a.start_seconds - b.start_seconds || a.sort_order - b.sort_order || a.id - b.id);

  if (sorted.length === 0 || duration < MIN_DURATION_FOR_FALLBACK) {
    return splitOversizedDisplaySubtitles(sorted);
  }

  if (sorted.length === 1 && isOversizedSubtitle(sorted[0])) {
    return splitSubtitleAcrossDuration(sorted[0], 0, duration);
  }

  const adjusted = hasCompressedTimeline(sorted, duration)
    ? redistributeAcrossDuration(sorted, duration)
    : sorted;

  return splitOversizedDisplaySubtitles(adjusted);
}

function hasCompressedTimeline(subtitles: VideoSubtitle[], duration: number) {
  if (subtitles.length === 0) return false;

  const minStart = Math.min(...subtitles.map((subtitle) => subtitle.start_seconds));
  const maxEnd = Math.max(...subtitles.map((subtitle) => subtitle.end_seconds));
  const totalWords = subtitles.reduce((total, subtitle) => total + wordCount(subtitle.text), 0);
  const span = maxEnd - minStart;

  return totalWords >= 25 && (span <= MAX_COMPRESSED_SPAN_SECONDS || span < duration * 0.05);
}

function redistributeAcrossDuration(subtitles: VideoSubtitle[], duration: number) {
  const totalWeight = subtitles.reduce((total, subtitle) => total + subtitleWeight(subtitle.text), 0);
  if (totalWeight <= 0) return subtitles;

  let cursor = 0;
  return subtitles.map((subtitle, index) => {
    const next = { ...subtitle };
    const end = index === subtitles.length - 1
      ? duration
      : cursor + duration * (subtitleWeight(subtitle.text) / totalWeight);

    next.start_seconds = cursor;
    next.end_seconds = Math.max(cursor + 0.5, end);
    cursor = next.end_seconds;
    return next;
  });
}

function splitOversizedDisplaySubtitles(subtitles: VideoSubtitle[]) {
  return subtitles.flatMap((subtitle) => {
    if (!isOversizedSubtitle(subtitle)) return [subtitle];
    return splitSubtitleAcrossDuration(subtitle, subtitle.start_seconds, subtitle.end_seconds);
  });
}

function splitSubtitleAcrossDuration(subtitle: VideoSubtitle, start: number, end: number) {
  const parts = splitSubtitleText(subtitle.text);
  if (parts.length <= 1) {
    return [{ ...subtitle, start_seconds: start, end_seconds: Math.max(start + 1, end) }];
  }

  const duration = Math.max(1, end - start);
  const totalWeight = parts.reduce((total, part) => total + subtitleWeight(part), 0);
  let cursor = start;

  return parts.map((part, index) => {
    const nextEnd = index === parts.length - 1
      ? end
      : cursor + duration * (subtitleWeight(part) / totalWeight);
    const displayId = -Math.abs(subtitle.id * 100000 + index + 1);
    const next: PlaybackVideoSubtitle = {
      ...subtitle,
      id: displayId,
      sort_order: subtitle.sort_order * 1000 + index + 1,
      start_seconds: cursor,
      end_seconds: Math.max(cursor + 0.5, nextEnd),
      text: part,
      playback_generated: true,
    };
    cursor = next.end_seconds;
    return next;
  });
}

function splitSubtitleText(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return [];

  const sentenceParts = splitBySentenceBoundaries(normalized).flatMap(splitLongPartByWords);
  if (sentenceParts.length > 1) return sentenceParts;
  return splitLongPartByWords(normalized);
}

function splitBySentenceBoundaries(text: string) {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ('.?!;:。？！；：'.includes(char) && index + 1 - start > 20) {
      const part = text.slice(start, index + 1).trim();
      if (part) parts.push(part);
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [text];
}

function splitLongPartByWords(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_SUBTITLE_WORDS && runeLength(text) <= MAX_SUBTITLE_RUNES) {
    return [text];
  }

  if (words.length <= 1) {
    return splitByRunes(text);
  }

  const parts: string[] = [];
  for (let start = 0; start < words.length;) {
    let end = findNaturalWordBoundary(words, start);
    const remaining = words.length - end;
    if (remaining > 0 && remaining < 8) {
      end = words.length;
    }
    if (end - start > MAX_SUBTITLE_WORDS) {
      end = start + MAX_SUBTITLE_WORDS;
    }
    parts.push(words.slice(start, end).join(' '));
    start = end;
  }
  return parts;
}

function findNaturalWordBoundary(words: string[], start: number) {
  const minEnd = Math.min(words.length, start + TARGET_SUBTITLE_WORDS);
  const maxEnd = Math.min(words.length, start + MAX_SUBTITLE_WORDS);

  for (let index = minEnd; index < maxEnd; index += 1) {
    const previous = words[index - 1]?.toLowerCase() || '';
    const current = words[index]?.toLowerCase() || '';
    if (isLikelyPhraseBoundary(previous, current)) {
      return index;
    }
  }

  return minEnd;
}

function isLikelyPhraseBoundary(previous: string, current: string) {
  if (!current) return true;
  if (/[,.?!;:]$/.test(previous)) return true;
  if (['and', 'but', 'so', 'because', 'when', 'while', 'if', 'then', 'now', 'today', 'there'].includes(current)) {
    return true;
  }
  if (['we', 'i', 'you', 'they', 'he', 'she', 'it', 'this', 'that', 'these', 'those'].includes(current)) {
    return true;
  }
  return false;
}

function splitByRunes(text: string) {
  const runes = Array.from(text);
  const parts: string[] = [];
  for (let start = 0; start < runes.length; start += MAX_SUBTITLE_RUNES) {
    const part = runes.slice(start, start + MAX_SUBTITLE_RUNES).join('').trim();
    if (part) parts.push(part);
  }
  return parts;
}

function isOversizedSubtitle(subtitle: VideoSubtitle) {
  return wordCount(subtitle.text) > MAX_SUBTITLE_WORDS || runeLength(subtitle.text) > MAX_SUBTITLE_RUNES;
}

function subtitleWeight(text: string) {
  return Math.max(1, runeLength(text));
}

function runeLength(text: string) {
  return Array.from(text).length;
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}
