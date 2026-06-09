'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { resolveAPIAssetURL, videoLessonAPI } from '@/lib/api';
import { PlaybackVideoSubtitle } from '@/lib/videoSubtitles';
import { VideoLesson, VideoSubtitle } from '@/types';
import { formatDuration, isProcessingStatus } from './VideoLessonCard';

interface VideoStudyPlayerProps {
  lesson: VideoLesson;
  subtitles: PlaybackVideoSubtitle[];
  currentTime: number;
  onTimeChange: (seconds: number) => void;
  onSeekReady?: (seek: (seconds: number) => void) => void;
  onLessonChange: (lesson: VideoLesson) => void;
  onSubtitlesChange: (subtitles: VideoSubtitle[]) => void;
}

const statusLabels: Record<string, string> = {
  uploaded: '已上传',
  extracting_audio: '正在提取音频',
  transcribing: '正在生成字幕',
  segmenting: '正在整理字幕',
  ready: '可学习',
  failed: '处理失败',
  cancelled: '已取消',
};

function formatVTTTime(seconds: number) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(wholeSeconds).padStart(2, '0'),
  ].join(':') + `.${String(milliseconds).padStart(3, '0')}`;
}

function sanitizeVTTText(text: string) {
  return text.replace(/\r/g, '').replace(/-->/g, '->').trim();
}

function buildSubtitleVTT(subtitles: VideoSubtitle[], mode: 'bilingual' | 'english') {
  const cues = subtitles
    .filter((subtitle) => subtitle.text.trim() && subtitle.end_seconds > subtitle.start_seconds)
    .map((subtitle, index) => {
      const lines = [sanitizeVTTText(subtitle.text)];
      if (mode === 'bilingual' && subtitle.translation?.trim()) {
        lines.push(sanitizeVTTText(subtitle.translation));
      }

      return [
        String(index + 1),
        `${formatVTTTime(subtitle.start_seconds)} --> ${formatVTTTime(subtitle.end_seconds)}`,
        lines.join('\n'),
      ].join('\n');
    });

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export default function VideoStudyPlayer({
  lesson,
  subtitles,
  currentTime,
  onTimeChange,
  onSeekReady,
  onLessonChange,
  onSubtitlesChange,
}: VideoStudyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const watchedRef = useRef(0);
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [trackURLs, setTrackURLs] = useState<{ bilingual: string; english: string } | null>(null);

  const videoSource = useMemo(() => resolveAPIAssetURL(lesson.video_path), [lesson.video_path]);
  const activeIndex = useMemo(
    () =>
      subtitles.findIndex(
        (subtitle) => currentTime >= subtitle.start_seconds && currentTime < subtitle.end_seconds
      ),
    [currentTime, subtitles]
  );
  const activeSubtitle = useMemo(
    () =>
      subtitles.find(
        (subtitle) => currentTime >= subtitle.start_seconds && currentTime < subtitle.end_seconds
      ),
    [currentTime, subtitles]
  );
  const getCurrentTime = useCallback(() => {
    return videoRef.current?.currentTime ?? 0;
  }, []);

  useEffect(() => {
    setPlayerError('');
    lastPlaybackTimeRef.current = null;
  }, [lesson.id, videoSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (
      video &&
      video.readyState > 0 &&
      lesson.last_position_seconds > 0 &&
      Math.abs(getCurrentTime() - lesson.last_position_seconds) > 1
    ) {
      video.currentTime = lesson.last_position_seconds;
    }
  }, [getCurrentTime, lesson.id, lesson.last_position_seconds]);

  useEffect(() => {
    const validSubtitles = subtitles.filter(
      (subtitle) => subtitle.text.trim() && subtitle.end_seconds > subtitle.start_seconds
    );
    if (validSubtitles.length === 0) {
      setTrackURLs(null);
      return;
    }

    const bilingualURL = URL.createObjectURL(
      new Blob([buildSubtitleVTT(validSubtitles, 'bilingual')], { type: 'text/vtt' })
    );
    const englishURL = URL.createObjectURL(
      new Blob([buildSubtitleVTT(validSubtitles, 'english')], { type: 'text/vtt' })
    );

    setTrackURLs({ bilingual: bilingualURL, english: englishURL });

    return () => {
      URL.revokeObjectURL(bilingualURL);
      URL.revokeObjectURL(englishURL);
    };
  }, [subtitles]);

  const saveProgress = useCallback(async (completed = false) => {
    const position = getCurrentTime();
    if (!videoRef.current) return;
    const watchedSeconds = Math.max(0, Math.round(watchedRef.current));
    watchedRef.current = 0;
    const response = await videoLessonAPI.updateProgress(lesson.id, {
      last_position_seconds: position,
      completed,
      watched_seconds: watchedSeconds,
    });
    onLessonChange(response.data.data as VideoLesson);
    lastSavedRef.current = Date.now();
  }, [getCurrentTime, lesson.id, onLessonChange]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const current = getCurrentTime();
    onTimeChange(current);
    if (video && !video.paused && lastPlaybackTimeRef.current !== null) {
      const delta = current - lastPlaybackTimeRef.current;
      if (delta > 0 && delta < 2) {
        watchedRef.current += delta;
      }
    }
    lastPlaybackTimeRef.current = current;
    if (Date.now() - lastSavedRef.current > 30000) {
      saveProgress(false).catch(() => undefined);
    }
  }, [getCurrentTime, onTimeChange, saveProgress]);

  const handleProcess = async () => {
    try {
      setProcessing(true);
      const response = await videoLessonAPI.process(lesson.id);
      onLessonChange(response.data.data as VideoLesson);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubtitleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      setImporting(true);
      const response = await videoLessonAPI.importSubtitles(lesson.id, data);
      onSubtitlesChange(response.data.data as VideoSubtitle[]);
      const lessonResponse = await videoLessonAPI.get(lesson.id);
      onLessonChange(lessonResponse.data.data as VideoLesson);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const seekRelative = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, getCurrentTime() + delta);
  };

  const seekSubtitle = (direction: -1 | 1) => {
    const next = subtitles[activeIndex + direction];
    const video = videoRef.current;
    if (!next || !video) return;
    video.currentTime = next.start_seconds;
    video.play().catch(() => undefined);
  };

  useEffect(() => {
    if (!onSeekReady) return;
    onSeekReady((seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, seconds);
      video.play().catch(() => undefined);
    });
  }, [onSeekReady]);

  const completed = lesson.completed_at || (lesson.duration_seconds > 0 && currentTime / lesson.duration_seconds >= 0.9);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-300">
              {statusLabels[lesson.status] || lesson.status}
            </span>
            <span className="text-xs text-gray-500">{formatDuration(lesson.duration_seconds)}</span>
            {completed && <span className="text-xs font-semibold text-green-300">已完成</span>}
          </div>
          <h1 className="text-2xl font-black text-gray-100">{lesson.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            导入字幕
            <input type="file" accept=".srt,.vtt" onChange={handleSubtitleImport} className="hidden" />
          </label>
          {(lesson.status === 'uploaded' || lesson.status === 'ready' || lesson.status === 'failed') && (
            <button
              type="button"
              onClick={() => {
                if (lesson.status === 'ready' && !window.confirm('重新生成字幕会替换当前字幕，继续？')) return;
                handleProcess();
              }}
              disabled={processing}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {lesson.status === 'ready' ? '重新生成字幕' : '生成字幕'}
            </button>
          )}
        </div>
      </div>

      <div className="video-learning-player relative isolate aspect-video w-full overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          src={videoSource}
          controls
          preload="metadata"
          className="absolute inset-0 block h-full w-full bg-black"
          playsInline
          onLoadedMetadata={() => {
            if (
              lesson.last_position_seconds > 0 &&
              videoRef.current &&
              Math.abs(videoRef.current.currentTime - lesson.last_position_seconds) > 1
            ) {
              videoRef.current.currentTime = lesson.last_position_seconds;
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => {
            setPlayerError('');
            lastPlaybackTimeRef.current = videoRef.current?.currentTime ?? null;
          }}
          onSeeking={() => {
            lastPlaybackTimeRef.current = videoRef.current?.currentTime ?? null;
          }}
          onPause={() => {
            lastPlaybackTimeRef.current = null;
            saveProgress(false).catch(() => undefined);
          }}
          onEnded={() => saveProgress(true).catch(() => undefined)}
          onError={() => setPlayerError('播放器加载失败，请刷新页面或重新上传视频文件')}
        >
          {trackURLs && (
            <>
            <track kind="subtitles" label="双语" srcLang="en-zh" src={trackURLs.bilingual} default />
            <track kind="subtitles" label="英文" srcLang="en" src={trackURLs.english} />
            </>
          )}
        </video>
        {activeSubtitle && (
          <div className="pointer-events-none absolute inset-x-3 bottom-14 z-10 flex justify-center sm:bottom-16">
            <div className="max-w-[min(92%,48rem)] rounded bg-black/80 px-3 py-2 text-center shadow-lg ring-1 ring-white/10">
              <p className="text-sm font-bold leading-6 text-white sm:text-lg sm:leading-7">
                {activeSubtitle.text}
              </p>
              {activeSubtitle.translation && (
                <p className="mt-1 text-xs font-semibold leading-5 text-gray-200 sm:text-base sm:leading-6">
                  {activeSubtitle.translation}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {playerError && <div className="mt-3 text-sm text-amber-200">{playerError}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => seekRelative(-5)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900"
        >
          <SkipBack className="h-4 w-4" />
          5s
        </button>
        <button
          type="button"
          onClick={() => seekSubtitle(-1)}
          disabled={activeIndex <= 0}
          className="rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900 disabled:opacity-40"
        >
          上一句
        </button>
        <button
          type="button"
          onClick={() => seekSubtitle(1)}
          disabled={activeIndex < 0 || activeIndex >= subtitles.length - 1}
          className="rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900 disabled:opacity-40"
        >
          下一句
        </button>
        <button
          type="button"
          onClick={() => seekRelative(5)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900"
        >
          5s
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {isProcessingStatus(lesson.status) && (
        <div className="mt-4 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-blue-100">
            <span>{statusLabels[lesson.status]}</span>
            <span>{lesson.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full bg-blue-500" style={{ width: `${Math.max(5, lesson.progress)}%` }} />
          </div>
        </div>
      )}

      {lesson.status === 'failed' && lesson.error && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6 text-amber-200">
          {lesson.error}
        </div>
      )}
    </div>
  );
}
