import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import OpenAI from 'openai';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

const transcribeWithOpenAI = async ({ recordingPath, language }) => {
  if (!client) {
    return {
      text: 'Transcription skipped because OPENAI_API_KEY is not configured.',
      language: language || process.env.TRANSCRIPTION_LANGUAGE || 'en',
      segments: [{ start: 0, end: 2, text: 'Transcription unavailable: missing OPENAI_API_KEY.' }],
      provider: 'none'
    };
  }

  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(recordingPath),
    model,
    language: language || process.env.TRANSCRIPTION_LANGUAGE || 'en',
    response_format: 'verbose_json'
  });

  return {
    text: String(response.text || '').trim(),
    language: response.language || language || process.env.TRANSCRIPTION_LANGUAGE || 'en',
    segments: response.segments || [],
    provider: 'openai',
    model
  };
};

export const generateTranscriptionArtifacts = async ({
  recordingPath,
  transcriptsDir,
  transcriptBaseName,
  recordingDuration = 0,
  language
}) => {
  await fsPromises.mkdir(transcriptsDir, { recursive: true });

  let transcript;

  try {
    transcript = await transcribeWithOpenAI({ recordingPath, language });
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

  const normalizedSegments = normalizeSegments(transcript.segments, recordingDuration);
  const transcriptText = transcript.text || normalizedSegments.map((s) => s.text).join(' ');

  const jsonPayload = {
    language: transcript.language,
    provider: transcript.provider,
    model: transcript.model,
    text: transcriptText,
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
