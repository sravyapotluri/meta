package com.glassface.ui.detail

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.glassface.R
import com.glassface.databinding.ActivityPersonDetailBinding
import com.glassface.db.AppDatabase
import com.glassface.db.Person
import com.glassface.ui.admin.AddPersonActivity
import kotlinx.coroutines.launch

class PersonDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPersonDetailBinding
    private var person: Person? = null

    companion object {
        const val EXTRA_PERSON_ID = "extra_person_id"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPersonDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.person_details)

        val personId = intent.getLongExtra(EXTRA_PERSON_ID, -1L)
        if (personId == -1L) {
            finish()
            return
        }

        loadPerson(personId)

        binding.btnEdit.setOnClickListener {
            val intent = Intent(this, AddPersonActivity::class.java)
            intent.putExtra(AddPersonActivity.EXTRA_PERSON_ID, personId)
            startActivity(intent)
        }

        binding.btnDelete.setOnClickListener {
            showDeleteConfirmation()
        }
    }

    override fun onResume() {
        super.onResume()
        val personId = intent.getLongExtra(EXTRA_PERSON_ID, -1L)
        if (personId != -1L) {
            loadPerson(personId)
        }
    }

    private fun loadPerson(personId: Long) {
        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@PersonDetailActivity)
            val loadedPerson = database.personDao().getPersonById(personId)
            if (loadedPerson != null) {
                person = loadedPerson
                runOnUiThread { displayPerson(loadedPerson) }
            } else {
                runOnUiThread { finish() }
            }
        }
    }

    private fun displayPerson(p: Person) {
        supportActionBar?.title = p.name
        binding.tvName.text = p.name

        if (p.title.isNotBlank()) {
            binding.tvTitle.text = p.title
            binding.tvTitle.visibility = View.VISIBLE
        } else {
            binding.tvTitle.visibility = View.GONE
        }

        if (p.company.isNotBlank()) {
            binding.tvCompany.text = p.company
            binding.tvCompany.visibility = View.VISIBLE
        } else {
            binding.tvCompany.visibility = View.GONE
        }

        if (p.phone.isNotBlank()) {
            binding.tvPhone.text = p.phone
            binding.tvPhone.visibility = View.VISIBLE
            binding.tvPhoneLabel.visibility = View.VISIBLE
        } else {
            binding.tvPhone.visibility = View.GONE
            binding.tvPhoneLabel.visibility = View.GONE
        }

        if (p.email.isNotBlank()) {
            binding.tvEmail.text = p.email
            binding.tvEmail.visibility = View.VISIBLE
            binding.tvEmailLabel.visibility = View.VISIBLE
        } else {
            binding.tvEmail.visibility = View.GONE
            binding.tvEmailLabel.visibility = View.GONE
        }

        if (p.notes.isNotBlank()) {
            binding.tvNotes.text = p.notes
            binding.tvNotes.visibility = View.VISIBLE
            binding.tvNotesLabel.visibility = View.VISIBLE
        } else {
            binding.tvNotes.visibility = View.GONE
            binding.tvNotesLabel.visibility = View.GONE
        }

        if (p.photoPath.isNotBlank()) {
            try {
                val bitmap = BitmapFactory.decodeFile(p.photoPath)
                if (bitmap != null) {
                    binding.ivPhoto.setImageBitmap(bitmap)
                    binding.ivPhoto.visibility = View.VISIBLE
                } else {
                    binding.ivPhoto.visibility = View.GONE
                }
            } catch (e: Exception) {
                binding.ivPhoto.visibility = View.GONE
            }
        } else {
            binding.ivPhoto.visibility = View.GONE
        }
    }

    private fun showDeleteConfirmation() {
        val p = person ?: return
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.delete_person))
            .setMessage(getString(R.string.delete_person_confirmation, p.name))
            .setPositiveButton(getString(R.string.delete)) { _, _ ->
                deletePerson(p)
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun deletePerson(p: Person) {
        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@PersonDetailActivity)
            database.personDao().deletePerson(p)
            runOnUiThread {
                Toast.makeText(
                    this@PersonDetailActivity,
                    getString(R.string.person_deleted, p.name),
                    Toast.LENGTH_SHORT
                ).show()
                finish()
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
