package com.cloudwebrtc.webrtc.record;

import android.media.MediaCodec;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * One MP4 shared by the audio and video encoder threads. MediaMuxer can only start once every track
 * is known, and the first video frame may arrive after the first audio, so samples queue until then.
 */
final class MeetingMuxer {
    private static final class Pending {
        final boolean video;
        final ByteBuffer data;
        final MediaCodec.BufferInfo info;
        Pending(boolean video, ByteBuffer data, MediaCodec.BufferInfo info) {
            this.video = video;
            this.data = data;
            this.info = info;
        }
    }

    private final MediaMuxer muxer;
    private final boolean withVideo;
    private int audioTrack = -1;
    private int videoTrack = -1;
    private boolean started;
    private boolean released;
    private final List<Pending> queue = new ArrayList<>();

    MeetingMuxer(String path, boolean withVideo) throws IOException {
        this.withVideo = withVideo;
        muxer = new MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
    }

    synchronized void addTrack(boolean video, MediaFormat format) {
        if (released || started) return;
        int index = muxer.addTrack(format);
        if (video) videoTrack = index; else audioTrack = index;
        if (audioTrack >= 0 && (!withVideo || videoTrack >= 0)) start();
    }

    private void start() {
        muxer.start();
        started = true;
        for (Pending p : queue) muxer.writeSampleData(p.video ? videoTrack : audioTrack, p.data, p.info);
        queue.clear();
    }

    synchronized void write(boolean video, ByteBuffer data, MediaCodec.BufferInfo info) {
        if (released || info.size <= 0 || (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) return;
        data.position(info.offset);
        data.limit(info.offset + info.size);
        if (started) {
            muxer.writeSampleData(video ? videoTrack : audioTrack, data, info);
        } else if (queue.size() < 2000) {
            ByteBuffer copy = ByteBuffer.allocate(info.size);
            copy.put(data);
            copy.flip();
            MediaCodec.BufferInfo copied = new MediaCodec.BufferInfo();
            copied.set(0, info.size, info.presentationTimeUs, info.flags);
            queue.add(new Pending(video, copy, copied));
        }
    }

    synchronized void finish() {
        if (released) return;
        // no video frame ever came: keep the audio rather than losing the whole file
        if (!started && audioTrack >= 0) {
            List<Pending> audio = new ArrayList<>(queue);
            queue.clear();
            for (Pending p : audio) if (!p.video) queue.add(p);
            start();
        }
        released = true;
        if (started) muxer.stop();
        muxer.release();
    }
}
