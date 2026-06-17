package com.glassface

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.glassface.camera.FaceAnalyzer
import com.glassface.databinding.ActivityMainBinding
import com.glassface.db.AppDatabase
import com.glassface.glasses.GlassesPrefs
import com.glassface.glasses.GlassesSettingsActivity
import com.glassface.glasses.GlassesType
import com.glassface.glasses.RecognitionMode
import com.glassface.tts.GlassesTTSManager
import com.glassface.ui.admin.AdminActivity
import com.glassface.watch.GlassesCaptureWatcher
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var ttsManager: GlassesTTSManager
    private var faceAnalyzer: FaceAnalyzer? = null
    private var glassesCaptureWatcher: GlassesCaptureWatcher? = null
    private var currentMode = RecognitionMode.PHONE_CAMERA

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.CAMERA] == true) {
            applyCurrentMode()
        } else {
            Toast.makeText(this, getString(R.string.camera_permission_denied), Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        cameraExecutor = Executors.newSingleThreadExecutor()
        ttsManager = GlassesTTSManager()
        ttsManager.initialize(this) {}

        binding.btnAdmin.setOnClickListener {
            startActivity(Intent(this, AdminActivity::class.java))
        }
        binding.btnToggleMode.setOnClickListener { toggleMode() }
        binding.btnGlassesSettings.setOnClickListener {
            startActivity(Intent(this, GlassesSettingsActivity::class.java))
        }

        checkAndRequestPermissions()
    }

    override fun onResume() {
        super.onResume()
        // Re-apply in case glasses type changed
        updateModeButtonLabel()
    }

    private fun checkAndRequestPermissions() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            needed.add(Manifest.permission.CAMERA)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED)
                needed.add(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                needed.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        if (needed.isEmpty()) applyCurrentMode() else requestPermissionsLauncher.launch(needed.toTypedArray())
    }

    private fun toggleMode() {
        val glassesType = GlassesPrefs.getGlassesType(this)
        val supported = glassesType.supportedModes()
        if (supported.size < 2) {
            // Only one mode — open glasses settings instead
            startActivity(Intent(this, GlassesSettingsActivity::class.java))
            return
        }
        currentMode = if (currentMode == RecognitionMode.PHONE_CAMERA) {
            RecognitionMode.GLASSES_CAPTURE
        } else {
            RecognitionMode.PHONE_CAMERA
        }
        applyCurrentMode()
    }

    private fun applyCurrentMode() {
        val glassesType = GlassesPrefs.getGlassesType(this)
        // Ensure mode is actually supported by selected glasses
        if (currentMode !in glassesType.supportedModes()) {
            currentMode = glassesType.defaultMode()
        }
        updateModeButtonLabel()
        stopAll()
        when (currentMode) {
            RecognitionMode.PHONE_CAMERA -> showLiveCamera(glassesType)
            RecognitionMode.GLASSES_CAPTURE -> showGlassesCaptureMode(glassesType)
        }
    }

    private fun updateModeButtonLabel() {
        val glassesType = GlassesPrefs.getGlassesType(this)
        binding.tvModeLabel.text = "${glassesType.displayName} · ${currentMode.displayName}"
        binding.btnToggleMode.text = if (currentMode == RecognitionMode.PHONE_CAMERA) {
            getString(R.string.switch_to_glasses_mode)
        } else {
            getString(R.string.switch_to_live_mode)
        }
    }

    private fun showLiveCamera(glassesType: GlassesType) {
        binding.previewView.visibility = View.VISIBLE
        binding.overlayView.visibility = View.VISIBLE
        binding.tvGlassesCaptureStatus.visibility = View.GONE

        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewView.surfaceProvider)
            }
            val personDao = AppDatabase.getInstance(this).personDao()
            faceAnalyzer = FaceAnalyzer(
                context = this,
                personDao = personDao,
                ttsManager = ttsManager,
                onResults = { results, srcW, srcH ->
                    runOnUiThread {
                        binding.overlayView.updateResults(results, srcW, srcH)
                        val known = results.filter { it.name != "Unknown" }
                        binding.tvResult.text = when {
                            known.isNotEmpty() -> known.joinToString(", ") { it.name }
                            results.isNotEmpty() -> getString(R.string.unknown_face)
                            else -> ""
                        }
                    }
                }
            )
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build().also { it.setAnalyzer(cameraExecutor, faceAnalyzer!!) }
            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.camera_error, e.message), Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun showGlassesCaptureMode(glassesType: GlassesType) {
        binding.previewView.visibility = View.INVISIBLE
        binding.overlayView.visibility = View.GONE
        binding.tvGlassesCaptureStatus.visibility = View.VISIBLE
        binding.tvResult.text = getString(R.string.glasses_capture_waiting)

        val watchPath = GlassesPrefs.getCustomWatchPath(this)
        glassesCaptureWatcher = GlassesCaptureWatcher(
            context = this,
            personDao = AppDatabase.getInstance(this).personDao(),
            ttsManager = ttsManager,
            watchPath = watchPath
        )
        glassesCaptureWatcher?.setOnResultListener { result ->
            runOnUiThread { binding.tvResult.text = result }
        }
        glassesCaptureWatcher?.start()
    }

    private fun stopAll() {
        faceAnalyzer?.close()
        faceAnalyzer = null
        try { ProcessCameraProvider.getInstance(this).get()?.unbindAll() } catch (_: Exception) {}
        glassesCaptureWatcher?.stop()
        glassesCaptureWatcher = null
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        stopAll()
        ttsManager.shutdown()
    }
}
