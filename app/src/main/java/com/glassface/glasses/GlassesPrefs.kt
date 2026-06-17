package com.glassface.glasses

import android.content.Context

object GlassesPrefs {
    private const val PREFS_NAME = "glassface_prefs"
    private const val KEY_GLASSES_TYPE = "glasses_type"
    private const val KEY_CUSTOM_WATCH_PATH = "custom_watch_path"

    fun saveGlassesType(context: Context, type: GlassesType) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_GLASSES_TYPE, type.ordinal).apply()
    }

    fun getGlassesType(context: Context): GlassesType {
        val ordinal = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getInt(KEY_GLASSES_TYPE, GlassesType.META_RAY_BAN.ordinal)
        return GlassesType.fromOrdinal(ordinal)
    }

    fun saveCustomWatchPath(context: Context, path: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_CUSTOM_WATCH_PATH, path).apply()
    }

    fun getCustomWatchPath(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_CUSTOM_WATCH_PATH, null)
            ?: defaultWatchPathFor(getGlassesType(context))
    }

    private fun defaultWatchPathFor(type: GlassesType): String = when (type) {
        GlassesType.META_RAY_BAN -> "/sdcard/DCIM/Camera"
        GlassesType.BRILLIANT_LABS_FRAME -> "/sdcard/DCIM/Camera"
        else -> "/sdcard/DCIM/Camera"
    }
}
