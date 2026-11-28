import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { isLocalWhisperAvailable, transcribeLocally } from './localWhisper.js';

/**
 * Speech from clients that cannot recognise it themselves (the phone app): short clips of
 * 16 kHz mono 16-bit PCM, turned into text by the local Whisper. One clip at a time, with a bounded
 * backlog: on a server that cannot keep up, clips are dropped rather than piling up.
 */
const RATE = 16000;
export const MAX_CLIP_BYTES = RATE * 2 * 30;
const MAX_WAITING = Number(process.env.SPEECH_MAX_WAITING) || 12;

let waiting = 0;
let chain = Promise.resolve();

export const toWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

export const canTranscribeSpeech = () => isLocalWhisperAvailable();

/** Resolves to the spoken text ('' for silence, or when the clip was dropped). */
export const transcribeClip = (pcm, { language } = {}) => {
  if (waiting >= MAX_WAITING) return Promise.resolve('');
  waiting += 1;
  const run = async () => {
    const file = path.join(os.tmpdir(), `speech-${uuidv4()}.wav`);
    try {
      await fs.writeFile(file, toWav(pcm), { mode: 0o600 });
      const result = await transcribeLocally({ recordingPath: file, language });
      return (result.text || '').trim();
    } finally {
      waiting -= 1;
      await fs.rm(file, { force: true });
    }
  };
  const result = chain.then(run);
  chain = result.catch(() => {});
  return result;
};
