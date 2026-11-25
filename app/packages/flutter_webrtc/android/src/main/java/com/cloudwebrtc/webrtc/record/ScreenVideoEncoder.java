package com.cloudwebrtc.webrtc.record;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.opengl.GLES20;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import org.webrtc.EglBase;
import org.webrtc.GlRectDrawer;
import org.webrtc.VideoFrame;
import org.webrtc.VideoFrameDrawer;
import org.webrtc.VideoSink;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Encodes the screen-capture track to H.264. The picture size is fixed by the first frame; later
 * frames (after a rotation) are letterboxed into it. Frames are never held: the capturer produces no
 * new one until the previous is released (and it refreshes a still screen once a second itself).
 */
final class ScreenVideoEncoder implements VideoSink {
    private static final String TAG = "ScreenVideoEncoder";

    private final MeetingMuxer muxer;
    private final long startNs;
    private final EglBase.Context sharedContext;
    private final HandlerThread thread = new HandlerThread("meeting-video-encoder");
    private final Handler handler;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

    private MediaCodec codec;
    private Surface surface;
    private EglBase egl;
    private VideoFrameDrawer frameDrawer;
    private GlRectDrawer drawer;
    private int width;
    private int height;
    private long lastTimeNs = -1;
    private volatile boolean stopped;

    ScreenVideoEncoder(MeetingMuxer muxer, long startNs, EglBase.Context sharedContext) {
        this.muxer = muxer;
        this.startNs = startNs;
        this.sharedContext = sharedContext;
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public void onFrame(VideoFrame frame) {
        if (stopped) return;
        frame.retain();
        boolean posted = handler.post(() -> {
            try {
                if (!stopped) render(frame);
            } finally {
                frame.release();
            }
        });
        if (!posted) frame.release();
    }

    private void render(VideoFrame frame) {
        try {
            if (codec == null) prepare(frame.getRotatedWidth(), frame.getRotatedHeight());
            float scale = Math.min((float) width / frame.getRotatedWidth(), (float) height / frame.getRotatedHeight());
            int w = Math.round(frame.getRotatedWidth() * scale);
            int h = Math.round(frame.getRotatedHeight() * scale);
            egl.makeCurrent();
            GLES20.glClearColor(0f, 0f, 0f, 1f);
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
            frameDrawer.drawFrame(frame, drawer, null, (width - w) / 2, (height - h) / 2, w, h);
            lastTimeNs = Math.max(System.nanoTime() - startNs, lastTimeNs + 1_000_000L);
            egl.swapBuffers(lastTimeNs);
            drain(false);
        } catch (IOException | RuntimeException e) {
            Log.e(TAG, "Could not encode a frame", e);
        }
    }

    private void prepare(int sourceWidth, int sourceHeight) throws IOException {
        width = sourceWidth / 16 * 16;
        height = sourceHeight / 16 * 16;
        MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        format.setInteger(MediaFormat.KEY_BIT_RATE, 2_500_000);
        format.setInteger(MediaFormat.KEY_FRAME_RATE, 15);
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        surface = codec.createInputSurface();
        codec.start();
        egl = EglBase.create(sharedContext, EglBase.CONFIG_RECORDABLE);
        egl.createSurface(surface);
        frameDrawer = new VideoFrameDrawer();
        drawer = new GlRectDrawer();
    }

    private void drain(boolean end) {
        int tries = 0;
        while (true) {
            int index = codec.dequeueOutputBuffer(info, end ? 10_000 : 0);
            if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!end || ++tries > 100) return;
            } else if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                muxer.addTrack(true, codec.getOutputFormat());
            } else if (index >= 0) {
                ByteBuffer data = codec.getOutputBuffer(index);
                muxer.write(true, data, info);
                codec.releaseOutputBuffer(index, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
            }
        }
    }

    /** Blocks until the remaining video is written. */
    void stop() {
        CountDownLatch done = new CountDownLatch(1);
        handler.post(() -> {
            try {
                stopped = true;
                if (codec != null) {
                    codec.signalEndOfInputStream();
                    drain(true);
                    codec.stop();
                    codec.release();
                    frameDrawer.release();
                    drawer.release();
                    egl.release();
                    surface.release();
                }
            } catch (RuntimeException e) {
                Log.e(TAG, "Could not finish the video", e);
            } finally {
                stopped = true;
                done.countDown();
            }
        });
        try {
            done.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        thread.quitSafely();
    }
}
