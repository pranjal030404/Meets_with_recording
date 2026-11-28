package com.cloudwebrtc.webrtc.record;

import android.media.AudioFormat;

import org.webrtc.audio.JavaAudioDeviceModule.AudioSamples;
import org.webrtc.audio.JavaAudioDeviceModule.SamplesReadyCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Collects the local microphone as 16 kHz mono 16-bit PCM, for transcription. */
public class SpeechCapture implements SamplesReadyCallback {
    private static final int RATE = 16000;
    private static final int MAX_BYTES = RATE * 2 * 30;

    private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

    @Override
    public synchronized void onWebRtcAudioRecordSamplesReady(AudioSamples samples) {
        if (samples.getAudioFormat() != AudioFormat.ENCODING_PCM_16BIT) return;
        ByteBuffer in = ByteBuffer.wrap(samples.getData()).order(ByteOrder.LITTLE_ENDIAN);
        int channels = Math.max(1, samples.getChannelCount());
        int frames = samples.getData().length / (2 * channels);
        int outFrames = (int) ((long) frames * RATE / samples.getSampleRate());
        for (int i = 0; i < outFrames && buffer.size() < MAX_BYTES; i++) {
            int start = (int) ((long) i * frames / outFrames);
            int end = Math.max(start + 1, (int) ((long) (i + 1) * frames / outFrames));
            long sum = 0; // averaging the skipped samples keeps high tones from folding into speech
            for (int f = start; f < end; f++) {
                for (int c = 0; c < channels; c++) sum += in.getShort((f * channels + c) * 2);
            }
            int value = (int) (sum / ((long) (end - start) * channels));
            buffer.write(value & 0xff);
            buffer.write((value >> 8) & 0xff);
        }
    }

    /** Everything heard since the last call. */
    public synchronized byte[] take() {
        byte[] out = buffer.toByteArray();
        buffer.reset();
        return out;
    }
}
