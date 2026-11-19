import { promises as fsPromises } from 'fs';
import path from 'path';
import { isLocalWhisperAvailable, transcribeLocally } from './localWhisper.js';
import { buildVocabulary, buildAsrPrompt, refineSegments } from './transcriptRefiner.js';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeSegments = (segments = [], fallbackDuration = 0) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [{
      start: 0,
      end: Math.max(fallbackDuration, 1),
      text: 'No transcription text available.'
    }];
  }

  return segments.map((seg, index) => {
    const start = toNumber(seg.start, 0);
    const endCandidate = toNumber(seg.end, start + 2);
    const end = endCandidate > start ? endCandidate : start + 2;

    return {
      id: seg.id ?? index + 1,
      start,
      end,
      text: String(seg.text || '').trim()
    };
  }).filter(seg => seg.text);
};

const pad = (num, size = 2) => String(num).padStart(size, '0');

const formatSrtTime = (seconds) => {
  const totalMs = Math.max(0, Math.floor(toNumber(seconds) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
};

const formatVttTime = (seconds) => {
  const totalMs = Math.max(0, Math.floor(toNumber(seconds) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
};

const buildSrt = (segments) => {
  return segments.map((segment, index) => {
    return `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`;
  }).join('\n');
};

const buildVtt = (segments) => {
  const body = segments.map((segment) => {
    return `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}\n${segment.text}\n`;
  }).join('\n');

  return `WEBVTT\n\n${body}`;
};

export const generateTranscriptionArtifacts = async ({
  recordingPath,
  transcriptsDir,
  transcriptBaseName,
  recordingDuration = 0,
  language,
  context = {}
}) => {
  await fsPromises.mkdir(transcriptsDir, { recursive: true });

  let transcript;

  try {
    const vocabulary = buildVocabulary(context);
    const prompt = buildAsrPrompt({ title: context.title, vocabulary });
    // Free, offline speech-to-text only (local Whisper). No paid API is used.
    if (isLocalWhisperAvailable()) {
      transcript = await transcribeLocally({ recordingPath, language, prompt });
    } else {
      transcript = {
        text: 'Local Whisper is not installed on the server (run backend/scripts/setup-free-transcription.sh). Live captions are used for notes instead.',
        language: language || 'en',
        segments: [],
        provider: 'none'
      };
    }
  } catch (error) {
    const errorMessage = error?.message || 'Transcription failed';
    transcript = {
      text: `Transcription failed: ${errorMessage}`,
      language: language || process.env.TRANSCRIPTION_LANGUAGE || 'en',
      segments: [{ start: 0, end: Math.max(recordingDuration, 2), text: `Transcription failed: ${errorMessage}` }],
      provider: 'error',
      model: null,
      error: errorMessage
    };
  }

  const rawSegments = normalizeSegments(transcript.segments, recordingDuration);
  const rawText = transcript.text || rawSegments.map((s) => s.text).join(' ');

  // Polish spoken-language artefacts (fillers, self-corrections, names) before saving.
  const usable = !['none', 'error'].includes(transcript.provider);
  const refinedResult = usable ? await refineSegments(rawSegments, context) : { segments: rawSegments, text: rawText, refined: false };
  const normalizedSegments = refinedResult.segments.length ? refinedResult.segments : rawSegments;
  const transcriptText = refinedResult.refined ? refinedResult.text : rawText;

  const jsonPayload = {
    language: transcript.language,
    provider: transcript.provider,
    model: transcript.model,
    text: transcriptText,
    rawText,
    refined: !!refinedResult.refined,
    duration: toNumber(recordingDuration),
    generatedAt: new Date().toISOString(),
    segments: normalizedSegments
  };

  const jsonPath = path.join(transcriptsDir, `${transcriptBaseName}.json`);
  const txtPath = path.join(transcriptsDir, `${transcriptBaseName}.txt`);
  const srtPath = path.join(transcriptsDir, `${transcriptBaseName}.srt`);
  const vttPath = path.join(transcriptsDir, `${transcriptBaseName}.vtt`);

  await Promise.all([
    fsPromises.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8'),
    fsPromises.writeFile(txtPath, transcriptText || '', 'utf8'),
    fsPromises.writeFile(srtPath, buildSrt(normalizedSegments), 'utf8'),
    fsPromises.writeFile(vttPath, buildVtt(normalizedSegments), 'utf8')
  ]);

  return {
    provider: transcript.provider,
    model: transcript.model,
    language: transcript.language,
    text: transcriptText,
    rawText,
    refined: !!refinedResult.refined,
    segments: normalizedSegments,
    generatedAt: jsonPayload.generatedAt,
    files: {
      json: jsonPath,
      txt: txtPath,
      srt: srtPath,
      vtt: vttPath
    },
    error: transcript.error || null
  };
};

export const buildCompleteTranscriptArtifacts = async ({
  recordings = [],
  transcriptsDir,
  transcriptBaseName = 'complete'
}) => {
  if (!transcriptsDir) throw new Error('transcriptsDir is required');
  await fsPromises.mkdir(transcriptsDir, { recursive: true });

  const mergedSegments = [];
  let offset = 0;
  let globalIndex = 1;
  const sources = recordings
    .filter(r => r && r.transcription)
    .filter(r => !['none', 'error'].includes(r.transcription.provider))
    .map(r => {
      const t = r.transcription || {};
      const segments = Array.isArray(t.segments) ? t.segments : [];
      const text = t.text || segments.map(x => x.text).join(' ');
      const generatedAt = t.generatedAt || r.createdAt || null;
      return { segments, text, generatedAt, duration: t.duration || r.duration || 0 };
    })
    .filter(src => src.segments.length > 0 || src.text);

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const rawSegments = (Array.isArray(src.segments) && src.segments.length > 0)
      ? src.segments
      : (src.text ? [{ start: 0, end: Math.max(toNumber(src.duration), 1), text: src.text }] : []);
    const segs = normalizeSegments(rawSegments, src.duration || 0);
    for (let j = 0; j < segs.length; j++) {
      const seg = segs[j];
      mergedSegments.push({
        id: globalIndex++,
        start: toNumber(seg.start) + offset,
        end: toNumber(seg.end) + offset,
        text: seg.text
      });
    }
    offset += toNumber(src.duration || 0);
  }

  const transcriptText = mergedSegments.length > 0
    ? mergedSegments.map(s => s.text).join(' ')
    : sources.map(s => s.text).filter(Boolean).join('\n\n');

  const jsonPayload = {
    language: null,
    provider: 'merged',
    model: null,
    text: transcriptText,
    duration: offset,
    generatedAt: new Date().toISOString(),
    segments: mergedSegments,
    sources: sources.length
  };

  const jsonPath = path.join(transcriptsDir, `${transcriptBaseName}.json`);
  const txtPath = path.join(transcriptsDir, `${transcriptBaseName}.txt`);
  const srtPath = path.join(transcriptsDir, `${transcriptBaseName}.srt`);
  const vttPath = path.join(transcriptsDir, `${transcriptBaseName}.vtt`);

  await Promise.all([
    fsPromises.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8'),
    fsPromises.writeFile(txtPath, transcriptText || '', 'utf8'),
    fsPromises.writeFile(srtPath, buildSrt(mergedSegments), 'utf8'),
    fsPromises.writeFile(vttPath, buildVtt(mergedSegments), 'utf8')
  ]);

  return {
    provider: 'merged',
    model: null,
    language: null,
    text: transcriptText,
    segments: mergedSegments,
    generatedAt: jsonPayload.generatedAt,
    duration: offset,
    files: {
      json: jsonPath,
      txt: txtPath,
      srt: srtPath,
      vtt: vttPath
    },
    error: null
  };
};
