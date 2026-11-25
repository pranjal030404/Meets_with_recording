package com.meetclone.meetclone

import android.Manifest
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

private const val PIP_ACTION = "com.meetclone.meetclone.PIP_ACTION"

/**
 * Pop-up (picture-in-picture) mode: leaving the app during a meeting keeps it in a floating window
 * with mic and leave buttons. Also starts the foreground service that keeps the call alive.
 */
class MainActivity : FlutterActivity() {
    private var channel: MethodChannel? = null
    private var popOnLeave = false
    private var micOn = false
    private var inCall = false
    private var visible = false

    private val pipSupported: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            channel?.invokeMethod("pipAction", intent.getStringExtra("action"))
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ContextCompat.registerReceiver(this, receiver, IntentFilter(PIP_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "minutes/pip").apply {
            setMethodCallHandler { call, result ->
                when (call.method) {
                    // sent whenever the call state changes while a meeting is on screen
                    "update" -> {
                        popOnLeave = call.argument<Boolean>("pop") == true
                        micOn = call.argument<Boolean>("micOn") == true
                        inCall = call.argument<Boolean>("inCall") == true
                        if (pipSupported) setPictureInPictureParams(params())
                        syncCallService()
                        result.success(null)
                    }
                    "enter" -> result.success(pipSupported && enterPictureInPictureMode(params()))
                    // after leaving from the floating window: put the window away
                    "close" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode) moveTaskToBack(false)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    /** Android only allows starting a mic/camera service while the app is on screen. */
    private fun syncCallService() {
        if (!inCall) {
            CallService.stop(this)
        } else if (visible && (granted(Manifest.permission.RECORD_AUDIO) || granted(Manifest.permission.CAMERA))) {
            CallService.start(this)
        }
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun action(name: String, icon: Int, title: String, code: Int): RemoteAction {
        val intent = Intent(PIP_ACTION).setPackage(packageName).putExtra("action", name)
        val pending = PendingIntent.getBroadcast(
            this, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return RemoteAction(Icon.createWithResource(this, icon), title, title, pending)
    }

    private fun params(): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(9, 16))
            .setActions(
                if (inCall) listOf(
                    action("mic", if (micOn) R.drawable.ic_pip_mic else R.drawable.ic_pip_mic_off,
                        if (micOn) "Mute" else "Unmute", 1),
                    action("leave", R.drawable.ic_pip_leave, "Leave", 2),
                ) else emptyList()
            )
        // Android 12+ enters by itself, including with gesture navigation
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(popOnLeave)
        return builder.build()
    }

    override fun onStart() {
        super.onStart()
        visible = true
        if (inCall) syncCallService()
    }

    override fun onStop() {
        visible = false
        super.onStop()
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(receiver) }
        CallService.stop(this)
        super.onDestroy()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (popOnLeave && pipSupported && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPictureInPictureMode(params())
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        channel?.invokeMethod("pipChanged", isInPictureInPictureMode)
    }
}
