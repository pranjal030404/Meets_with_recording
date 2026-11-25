package com.cloudwebrtc.webrtc;

import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.CapturerObserver;
import org.webrtc.VideoFrame;

import android.annotation.TargetApi;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.SystemClock;
import android.hardware.display.VirtualDisplay;
import java.lang.reflect.Field;
import android.util.Log;
import android.view.Surface;
import android.view.WindowManager;


/**
 * An implementation of ScreenCapturerAndroid to capture the screen content while being aware of device orientation
 */
@TargetApi(21)
public class OrientationAwareScreenCapturer
        extends ScreenCapturerAndroid {
    private Context applicationContext;
    private WindowManager windowManager;
    private int width;
    private int height;
    private boolean isPortrait;
    // Android only sends a frame when the screen changes. A share started on a running capture, or a
    // viewer joining while the screen is still, would see black: nudge a redraw when it goes quiet.
    private static final long IDLE_MS = 1000;
    private Handler captureHandler;
    private volatile long lastFrameAt;
    private int density = 400;
    private final Runnable keepAlive = new Runnable() {
        @Override
        public void run() {
            if (SystemClock.elapsedRealtime() - lastFrameAt >= IDLE_MS) redraw();
            captureHandler.postDelayed(this, IDLE_MS);
        }
    };

    /**
     * Constructs a new Screen Capturer.
     *
     * @param mediaProjectionPermissionResultData the result data of MediaProjection permission
     *                                            activity; the calling app must validate that result code is Activity.RESULT_OK before
     *                                            calling this method.
     * @param mediaProjectionCallback             MediaProjection callback to implement application specific
     *                                            logic in events such as when the user revokes a previously granted capture permission.
     **/
    public OrientationAwareScreenCapturer(Intent mediaProjectionPermissionResultData,
                                          MediaProjection.Callback mediaProjectionCallback) {
        super(mediaProjectionPermissionResultData, mediaProjectionCallback);
    }

    @Override
    public synchronized void initialize(SurfaceTextureHelper surfaceTextureHelper, Context applicationContext, CapturerObserver capturerObserver) {
        super.initialize(surfaceTextureHelper, applicationContext, capturerObserver);
        this.applicationContext = applicationContext;
        this.captureHandler = surfaceTextureHelper.getHandler();
        Log.d("OrientationAwareSC", "OrientationAwareScreenCapturer: initialized and orientation isPortrait? " + this.isPortrait);
    }

    @Override
    public synchronized void startCapture(int width, int height, int ignoredFramerate) {
        this.windowManager = (WindowManager) applicationContext.getSystemService(
                Context.WINDOW_SERVICE);
        this.isPortrait = isDeviceOrientationPortrait();
        if (this.isPortrait) {
            this.width = width;
            this.height = height;
        } else {
            this.height = width;
            this.width = height;
        }
        super.startCapture(width, height, ignoredFramerate);
        captureHandler.removeCallbacks(keepAlive);
        captureHandler.postDelayed(keepAlive, IDLE_MS);
    }

    @Override
    public synchronized void stopCapture() {
        if (captureHandler != null) captureHandler.removeCallbacks(keepAlive);
        super.stopCapture();
    }

    // A density change of one dpi leaves the picture identical but makes the system compose it again
    private void redraw() {
        try {
            Field field = ScreenCapturerAndroid.class.getDeclaredField("virtualDisplay");
            field.setAccessible(true);
            VirtualDisplay display = (VirtualDisplay) field.get(this);
            if (display == null) return;
            density = density == 400 ? 401 : 400;
            boolean portrait = this.isPortrait;
            display.resize(portrait ? this.width : this.height, portrait ? this.height : this.width, density);
        } catch (ReflectiveOperationException e) {
            Log.w("OrientationAwareSC", "Could not redraw the capture", e);
        }
    }

    @Override
    public void onFrame(VideoFrame frame) {
        lastFrameAt = SystemClock.elapsedRealtime();
        final boolean isOrientationPortrait = isDeviceOrientationPortrait();
        if (isOrientationPortrait != this.isPortrait) {
            this.isPortrait = isOrientationPortrait;

            resizeCapture(this.isPortrait ? this.width : this.height, this.isPortrait ? this.height : this.width);
        }
        super.onFrame(frame);
    }

    // Runs on the capture thread (onFrame). org.webrtc is kept by proguard-rules.pro, so reflection is safe.
    private void resizeCapture(int width, int height) {
        try {
            Field displayField = ScreenCapturerAndroid.class.getDeclaredField("virtualDisplay");
            displayField.setAccessible(true);
            VirtualDisplay virtualDisplay = (VirtualDisplay) displayField.get(this);
            Field helperField = ScreenCapturerAndroid.class.getDeclaredField("surfaceTextureHelper");
            helperField.setAccessible(true);
            SurfaceTextureHelper helper = (SurfaceTextureHelper) helperField.get(this);
            if (virtualDisplay == null || helper == null) return;
            helper.setTextureSize(width, height);
            virtualDisplay.resize(width, height, density);
        } catch (ReflectiveOperationException e) {
            // keep the old size: the picture is letterboxed but the share stays up
            Log.w("OrientationAwareSC", "Could not resize the capture", e);
        }
    }

    private boolean isDeviceOrientationPortrait() {
        final int surfaceRotation = windowManager.getDefaultDisplay().getRotation();

        return surfaceRotation != Surface.ROTATION_90 && surfaceRotation != Surface.ROTATION_270;
    }

}
