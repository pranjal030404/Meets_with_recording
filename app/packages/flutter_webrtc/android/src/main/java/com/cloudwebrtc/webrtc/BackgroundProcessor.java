package com.cloudwebrtc.webrtc;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Log;

import androidx.annotation.Nullable;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.Segmentation;
import com.google.mlkit.vision.segmentation.SegmentationMask;
import com.google.mlkit.vision.segmentation.Segmenter;
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions;

import org.webrtc.JavaI420Buffer;
import org.webrtc.VideoFrame;
import org.webrtc.VideoProcessor;
import org.webrtc.VideoSink;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.concurrent.TimeUnit;

/**
 * Background blur / virtual background: cuts the person out of each camera frame on the device
 * (ML Kit selfie segmentation) and puts them over a blurred copy or a picture. A frame that cannot
 * be processed is dropped, so the real background is never sent by accident.
 */
class BackgroundProcessor implements VideoProcessor {
    private static final String TAG = "BackgroundProcessor";
    private static final int MAX_SIDE = 640;

    private final Segmenter segmenter = Segmentation.getClient(new SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
            .build());
    private final Paint smooth = new Paint(Paint.FILTER_BITMAP_FLAG);
    @Nullable private final Bitmap picture; // null: blur
    @Nullable private volatile VideoSink sink;
    private volatile boolean released = false;

    BackgroundProcessor(@Nullable String imagePath) {
        if (imagePath == null) {
            picture = null;
            return;
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(imagePath, options);
        options.inSampleSize = Math.max(1, Math.max(options.outWidth, options.outHeight) / (MAX_SIDE * 2));
        options.inJustDecodeBounds = false;
        picture = BitmapFactory.decodeFile(imagePath, options);
        if (picture == null) throw new IllegalArgumentException("That picture could not be read");
    }

    @Override
    public void setSink(@Nullable VideoSink sink) {
        this.sink = sink;
    }

    @Override
    public void onCapturerStarted(boolean success) {}

    @Override
    public void onCapturerStopped() {}

    synchronized void release() {
        released = true;
        segmenter.close();
    }

    @Override
    public synchronized void onFrameCaptured(VideoFrame frame) {
        VideoSink target = sink;
        if (target == null || released) return;
        try {
            VideoFrame out = process(frame);
            target.onFrame(out);
            out.release();
        } catch (Exception e) {
            Log.w(TAG, "Frame dropped", e);
        }
    }

    private VideoFrame process(VideoFrame frame) throws Exception {
        VideoFrame.Buffer source = frame.getBuffer();
        int width = source.getWidth(), height = source.getHeight();
        float scale = Math.min(1f, (float) MAX_SIDE / Math.max(width, height));
        int w = Math.round(width * scale) & ~1, h = Math.round(height * scale) & ~1;

        VideoFrame.Buffer scaled = source.cropAndScale(0, 0, width, height, w, h);
        VideoFrame.I420Buffer i420 = scaled.toI420();
        scaled.release();
        Bitmap camera = toBitmap(i420);
        i420.release();

        // work upright, so the person and the chosen picture are the right way up
        if (frame.getRotation() != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(frame.getRotation());
            camera = Bitmap.createBitmap(camera, 0, 0, w, h, matrix, true);
            w = camera.getWidth();
            h = camera.getHeight();
        }

        SegmentationMask mask = Tasks.await(segmenter.process(InputImage.fromBitmap(camera, 0)), 1, TimeUnit.SECONDS);
        int[] person = new int[w * h];
        camera.getPixels(person, 0, w, 0, 0, w, h);
        int[] behind = new int[w * h];
        background(camera, w, h).getPixels(behind, 0, w, 0, 0, w, h);

        int mw = mask.getWidth(), mh = mask.getHeight();
        ByteBuffer bytes = mask.getBuffer();
        bytes.rewind();
        FloatBuffer confidence = bytes.order(ByteOrder.nativeOrder()).asFloatBuffer();
        float[] values = new float[mw * mh];
        confidence.get(values);

        for (int y = 0; y < h; y++) {
            int row = (y * mh / h) * mw;
            for (int x = 0; x < w; x++) {
                int a = (int) (values[row + x * mw / w] * 256);
                int i = y * w + x;
                if (a >= 250) continue;
                if (a <= 6) {
                    person[i] = behind[i];
                    continue;
                }
                int f = person[i], b = behind[i];
                int rb = (((f & 0xFF00FF) * a + (b & 0xFF00FF) * (256 - a)) >>> 8) & 0xFF00FF;
                int g = (((f & 0x00FF00) * a + (b & 0x00FF00) * (256 - a)) >>> 8) & 0x00FF00;
                person[i] = 0xFF000000 | rb | g;
            }
        }
        return new VideoFrame(toI420(person, w, h), 0, frame.getTimestampNs());
    }

    private Bitmap background(Bitmap camera, int w, int h) {
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        if (picture == null) {
            // shrinking and stretching again with filtering is a cheap, smooth blur
            Bitmap tiny = Bitmap.createScaledBitmap(camera, Math.max(1, w / 24), Math.max(1, h / 24), true);
            canvas.drawBitmap(tiny, null, new Rect(0, 0, w, h), smooth);
        } else {
            float scale = Math.max((float) w / picture.getWidth(), (float) h / picture.getHeight());
            int sw = Math.round(w / scale), sh = Math.round(h / scale);
            int left = (picture.getWidth() - sw) / 2, top = (picture.getHeight() - sh) / 2;
            canvas.drawBitmap(picture, new Rect(left, top, left + sw, top + sh), new Rect(0, 0, w, h), smooth);
        }
        return out;
    }

    private static Bitmap toBitmap(VideoFrame.I420Buffer buffer) {
        int w = buffer.getWidth(), h = buffer.getHeight();
        ByteBuffer ys = buffer.getDataY(), us = buffer.getDataU(), vs = buffer.getDataV();
        int[] argb = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int c = 298 * ((ys.get(y * buffer.getStrideY() + x) & 0xFF) - 16) + 128;
                int d = (us.get((y / 2) * buffer.getStrideU() + x / 2) & 0xFF) - 128;
                int e = (vs.get((y / 2) * buffer.getStrideV() + x / 2) & 0xFF) - 128;
                int r = clamp((c + 409 * e) >> 8);
                int g = clamp((c - 100 * d - 208 * e) >> 8);
                int b = clamp((c + 516 * d) >> 8);
                argb[y * w + x] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
        }
        return Bitmap.createBitmap(argb, w, h, Bitmap.Config.ARGB_8888);
    }

    private static JavaI420Buffer toI420(int[] argb, int w, int h) {
        JavaI420Buffer buffer = JavaI420Buffer.allocate(w, h);
        ByteBuffer ys = buffer.getDataY(), us = buffer.getDataU(), vs = buffer.getDataV();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = argb[y * w + x];
                int r = (p >> 16) & 0xFF, g = (p >> 8) & 0xFF, b = p & 0xFF;
                ys.put(y * buffer.getStrideY() + x, (byte) (((66 * r + 129 * g + 25 * b + 128) >> 8) + 16));
                if ((x & 1) == 0 && (y & 1) == 0) {
                    us.put((y / 2) * buffer.getStrideU() + x / 2, (byte) (((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128));
                    vs.put((y / 2) * buffer.getStrideV() + x / 2, (byte) (((112 * r - 94 * g - 18 * b + 128) >> 8) + 128));
                }
            }
        }
        return buffer;
    }

    private static int clamp(int v) {
        return v < 0 ? 0 : Math.min(v, 255);
    }
}
