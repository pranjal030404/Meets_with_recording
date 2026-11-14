import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Free local speech-to-text via scripts/local_whisper.py (faster-whisper). See backend/README for setup. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '../..');
const SCRIPT = path.join(BACKEND, 'scripts', 'local_whisper.py');

const pythonPath = () => {
  if (process.env.LOCAL_WHISPER_PYTHON) return process.env.LOCAL_WHISPER_PYTHON;
  const venv = path.join(BACKEND, '.venv-whisper', 'bin', 'python');
  const venvWin = path.join(BACKEND, '.venv-whisper', 'Scripts', 'python.exe');
  return [venv, venvWin].find((p) => fs.existsSync(p)) || null;
};

export const isLocalWhisperAvailable = () => process.env.LOCAL_WHISPER !== 'off' && !!pythonPath() && fs.existsSync(SCRIPT);

export const transcribeLocally = ({ recordingPath, language, prompt }) => new Promise((resolve, reject) => {
  const python = pythonPath();
  if (!python) return reject(new Error('Local Whisper is not installed'));

  const args = [SCRIPT, recordingPath, '--model', process.env.LOCAL_WHISPER_MODEL || 'base'];
  if (language) args.push('--language', language);
  if (prompt) args.push('--prompt', prompt);

  const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), Number(process.env.LOCAL_WHISPER_TIMEOUT_MS) || 30 * 60_000);

  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { clearTimeout(timer); reject(e); });
  child.on('close', (code) => {
    clearTimeout(timer);
    try {
      const parsed = JSON.parse(out.trim().split('\n').pop() || '{}');
      if (code !== 0 || parsed.error) return reject(new Error(parsed.error || err.slice(-300) || `whisper exited ${code}`));
      resolve({ ...parsed, provider: 'local-whisper', model: process.env.LOCAL_WHISPER_MODEL || 'base' });
    } catch {
      reject(new Error(err.slice(-300) || 'Could not parse whisper output'));
    }
  });
});
