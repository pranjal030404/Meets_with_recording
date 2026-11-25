package com.cloudwebrtc.webrtc.record;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.util.Log;

import org.webrtc.EglBase;
import org.webrtc.VideoTrack;
import org.webrtc.audio.JavaAudioDeviceModule.AudioSamples;
import org.webrtc.audio.JavaAudioDeviceModule.SamplesReadyCallback;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Records a meeting into an MP4: the local microphone mixed with everything the phone plays (the
 * other participants), plus the screen picture when a capture track is given. The two sources arrive on separate audio threads at their own
 * pace, so a writer thread follows the wall clock and takes whatever each has, filling gaps with
 * silence. That keeps the timeline right even while nobody is speaking.
 */
public class AudioMixRecorder {
    private static final String TAG = "AudioMixRecorder";
    private static final int RATE = 48000;
    private static final int CHUNK = RATE / 50; // 20 ms
    private static final int LATENCY = RATE / 5; // let both sources deliver before mixing

    /** Mono 48 kHz samples waiting to be mixed; the oldest are dropped if a source runs ahead. */
    private static final class Ring {
        private final short[] data = new short[RATE * 2];
        private int read;
        private int size;

        synchronized void write(AudioSamples samples) {
            if (samples.getAudioFormat() != AudioFormat.ENCODING_PCM_16BIT) return;
            ByteBuffer in = ByteBuffer.wrap(samples.getData()).order(ByteOrder.LITTLE_ENDIAN);
            int channels = Math.max(1, samples.getChannelCount());
            int frames = samples.getData().length / (2 * channels);
            if (frames == 0) return;
            short[] mono = new short[frames];
            for (int i = 0; i < frames; i++) {
                int sum = 0;
                for (int c = 0; c < channels; c++) sum += in.getShort();
                mono[i] = (short) (sum / channels);
            }
            int outFrames = (int) ((long) frames * RATE / samples.getSampleRate());
            for (int i = 0; i < outFrames; i++) {
                if (size == data.length) {
                    read = (read + 1) % data.length;
                    size--;
                }
                data[(read + size) % data.length] = mono[(int) ((long) i * frames / outFrames)];
                size++;
            }
        }

        /** Adds up to out.length buffered samples into out. */
        synchronized void mixInto(int[] out) {
            int n = Math.min(out.length, size);
            for (int i = 0; i < n; i++) out[i] += data[(read + i) % data.length];
            read = (read + n) % data.length;
            size -= n;
        }
    }

    private final Ring mic = new Ring();
    private final Ring remote = new Ring();
    private volatile boolean micEnabled;
    private volatile boolean running;
    private Thread writer;
    private MeetingMuxer muxer;
    private ScreenVideoEncoder video;
    private VideoTrack videoTrack;

    public final SamplesReadyCallback micCallback = samples -> {
        // a muted microphone must never reach the file
        if (micEnabled) mic.write(samples);
    };
    public final SamplesReadyCallback remoteCallback = remote::write;

    public void setMicEnabled(boolean enabled) {
        micEnabled = enabled;
    }

    public void start(String path, boolean micOn, VideoTrack track, EglBase.Context egl) throws IOException {
        micEnabled = micOn;
        MediaFormat format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 1);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        format.setInteger(MediaFormat.KEY_BIT_RATE, 96000);
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, CHUNK * 4);
        final MediaCodec codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        codec.start();
        muxer = new MeetingMuxer(path, track != null);
        running = true;
        if (track != null) {
            videoTrack = track;
            video = new ScreenVideoEncoder(muxer, System.nanoTime(), egl);
            track.addSink(video);
        }
        writer = new Thread(() -> write(codec), "meeting-audio-recorder");
        writer.start();
    }

    /** Blocks until the file is complete. */
    public void stop() {
        if (video != null) {
            try {
                videoTrack.removeSink(video);
            } catch (RuntimeException e) {
                Log.w(TAG, "Capture track already gone", e);
            }
            video.stop();
            video = null;
        }
        running = false;
        if (writer == null) return;
        try {
            writer.join(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        writer = null;
        muxer.finish();
    }

    private void write(MediaCodec codec) {
        long started = System.nanoTime();
        long written = 0;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean ended = false;
        try {
            while (!ended) {
                boolean stopping = !running;
                long due = (System.nanoTime() - started) * RATE / 1_000_000_000L - (stopping ? 0 : LATENCY);
                if (written + CHUNK <= due || stopping) {
                    int index = codec.dequeueInputBuffer(10_000);
                    if (index >= 0) {
                        long timeUs = written * 1_000_000L / RATE;
                        if (stopping && written + CHUNK > due) {
                            codec.queueInputBuffer(index, 0, 0, timeUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        } else {
                            int[] mix = new int[CHUNK];
                            mic.mixInto(mix);
                            remote.mixInto(mix);
                            ByteBuffer input = codec.getInputBuffer(index);
                            input.clear();
                            input.order(ByteOrder.LITTLE_ENDIAN);
                            for (int v : mix) input.putShort((short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, v)));
                            codec.queueInputBuffer(index, 0, CHUNK * 2, timeUs, 0);
                            written += CHUNK;
                        }
                    }
                } else {
                    Thread.sleep(10);
                }
                int out;
                while ((out = codec.dequeueOutputBuffer(info, stopping ? 10_000 : 0)) != MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        muxer.addTrack(false, codec.getOutputFormat());
                    } else if (out >= 0) {
                        muxer.write(false, codec.getOutputBuffer(out), info);
                        codec.releaseOutputBuffer(out, false);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            ended = true;
                            break;
                        }
                    }
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            Log.e(TAG, "Recording failed", e);
        } finally {
            try {
                codec.stop();
                codec.release();
            } catch (RuntimeException e) {
                Log.e(TAG, "Could not finish the recording", e);
            }
        }
    }
}
