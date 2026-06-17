package com.glassface.glasses

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.glassface.R
import com.glassface.databinding.ActivityGlassesSettingsBinding

class GlassesSettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityGlassesSettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGlassesSettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.select_glasses_type)

        val current = GlassesPrefs.getGlassesType(this)

        GlassesType.values().forEach { type ->
            val rb = RadioButton(this).apply {
                text = type.displayName
                id = type.ordinal
                isChecked = (type == current)
                textSize = 16f
                setPadding(8, 16, 8, 4)
            }
            binding.radioGroupGlasses.addView(rb)

            val desc = TextView(this).apply {
                val caps = type.outputCapabilities()
                val modesText = type.supportedModes().joinToString(" | ") { it.displayName }
                text = "Modes: $modesText\nOutput: ${caps.displayDescription}"
                textSize = 13f
                alpha = 0.7f
                setPadding(40, 0, 8, 16)
            }
            binding.radioGroupGlasses.addView(desc)
        }

        binding.radioGroupGlasses.setOnCheckedChangeListener { _, checkedId ->
            val selected = GlassesType.fromOrdinal(checkedId)
            showCapabilities(selected)
        }

        showCapabilities(current)

        binding.btnConfirm.setOnClickListener {
            val checkedId = binding.radioGroupGlasses.checkedRadioButtonId
            if (checkedId >= 0) {
                val selected = GlassesType.fromOrdinal(checkedId)
                GlassesPrefs.saveGlassesType(this, selected)
            }
            setResult(RESULT_OK)
            finish()
        }
    }

    private fun showCapabilities(type: GlassesType) {
        val caps = type.outputCapabilities()
        val modes = type.supportedModes().joinToString(", ") { it.displayName }
        binding.tvCapabilitiesSummary.text =
            "Selected: ${type.displayName}\n" +
            "Supported modes: $modes\n" +
            "Output: ${caps.displayDescription}"
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    companion object {
        fun start(context: Context) {
            context.startActivity(Intent(context, GlassesSettingsActivity::class.java))
        }
    }
}
