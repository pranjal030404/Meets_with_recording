package com.cloudwebrtc.webrtc;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.ResultReceiver;
import android.util.Log;

/**
 * Foreground service that must be running while the screen is captured (required from Android 10,
 * enforced before getMediaProjection() from Android 14). It also declares the microphone type, so the
 * speaker keeps being heard after they switch to the app they are presenting.
 */
public class ScreenCaptureService extends Service {
    static final int RESULT_STARTED = 1;
    static final int RESULT_FAILED = 0;

    private static final String CHANNEL_ID = "screen_capture";
    private static final int NOTIFICATION_ID = 7341;
    private static final String EXTRA_RECEIVER = "receiver";

    static void start(Context context, ResultReceiver receiver) {
        Intent intent = new Intent(context, ScreenCaptureService.class);
        intent.putExtra(EXTRA_RECEIVER, receiver);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException e) {
            fail(receiver, e);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, ScreenCaptureService.class));
    }

    private static void fail(ResultReceiver receiver, Exception e) {
        Log.e(FlutterWebRTCPlugin.TAG, "Screen capture service could not start", e);
        if (receiver != null) {
            Bundle data = new Bundle();
            data.putString("message", e.getMessage());
            receiver.send(RESULT_FAILED, data);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        ResultReceiver receiver = intent == null ? null : intent.getParcelableExtra(EXTRA_RECEIVER);
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
                startForeground(NOTIFICATION_ID, notification, types);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            if (receiver != null) receiver.send(RESULT_STARTED, null);
        } catch (RuntimeException e) {
            fail(receiver, e);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(
                    new NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW));
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        builder.setContentTitle("You are sharing your screen")
                .setContentText("Open the app to stop sharing")
                .setSmallIcon(android.R.drawable.ic_menu_share)
                .setOngoing(true);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            int immutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
            builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, immutable));
        }
        return builder.build();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
