import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { generateTranscriptionArtifacts } from './transcriptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../../uploads');

const toPublicUrl = (...segments) => `/${path.posix.join(...segments)}`;

export const saveMeetingRecording = async ({
  roomId,
  sourcePath,
  originalName,
  mimeType,
  size,
  duration = 0,
  recordedBy,
  language
}) => {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const extension = path.extname(originalName || '').toLowerCase() || '.webm';
  const recordingFileName = `${recordingId}${extension}`;

  const recordingDir = path.join(uploadsRoot, 'recordings', roomId);
  const transcriptsDir = path.join(uploadsRoot, 'transcripts', roomId);

  await Promise.all([
    fs.mkdir(recordingDir, { recursive: true }),
    fs.mkdir(transcriptsDir, { recursive: true })
  ]);

  const recordingPath = path.join(recordingDir, recordingFileName);
  await fs.copyFile(sourcePath, recordingPath);

  let transcript;
  try {
    transcript = await generateTranscriptionArtifacts({
      recordingPath,
      transcriptsDir,
      transcriptBaseName: recordingId,
      recordingDuration: duration,
      language
    });
  } finally {
    await fs.unlink(sourcePath).catch(() => {});
  }

  const recordingUrl = toPublicUrl('uploads', 'recordings', roomId, recordingFileName);
  const transcriptBaseUrl = toPublicUrl('uploads', 'transcripts', roomId);

  return {
    recording: {
      filename: recordingFileName,
      originalName: originalName || recordingFileName,
      url: recordingUrl,
      path: recordingPath,
      duration,
      mimeType,
      size,
      recordedBy,
      transcription: {
        status: transcript.error ? 'failed' : 'completed',
        language: transcript.language,
        provider: transcript.provider,
        model: transcript.model,
        text: transcript.text,
        duration,
        generatedAt: transcript.generatedAt,
        error: transcript.error,
        segments: transcript.segments,
        files: {
          json: {
            path: transcript.files.json,
            url: toPublicUrl('uploads', 'transcripts', roomId, `${recordingId}.json`)
          },
          txt: {
            path: transcript.files.txt,
            url: toPublicUrl('uploads', 'transcripts', roomId, `${recordingId}.txt`)
          },
          srt: {
            path: transcript.files.srt,
            url: toPublicUrl('uploads', 'transcripts', roomId, `${recordingId}.srt`)
          },
          vtt: {
            path: transcript.files.vtt,
            url: toPublicUrl('uploads', 'transcripts', roomId, `${recordingId}.vtt`)
          }
        }
      }
    },
    transcriptDir: transcriptBaseUrl,
    transcript
  };
};