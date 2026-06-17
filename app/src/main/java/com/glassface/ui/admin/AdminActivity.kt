package com.glassface.ui.admin

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.glassface.databinding.ActivityAdminBinding
import com.glassface.db.AppDatabase
import com.glassface.db.Person
import com.glassface.ui.detail.PersonDetailActivity
import kotlinx.coroutines.launch

class AdminActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminBinding
    private lateinit var adapter: PersonAdapter
    private val personList = mutableListOf<Person>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(com.glassface.R.string.manage_people)

        adapter = PersonAdapter(
            persons = personList,
            onClick = { person ->
                val intent = Intent(this, PersonDetailActivity::class.java)
                intent.putExtra(PersonDetailActivity.EXTRA_PERSON_ID, person.id)
                startActivity(intent)
            },
            onLongClick = { person ->
                showDeleteConfirmation(person)
            }
        )

        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = adapter

        binding.fabAdd.setOnClickListener {
            startActivity(Intent(this, AddPersonActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        loadPersons()
    }

    private fun loadPersons() {
        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@AdminActivity)
            val persons = database.personDao().getAllPersons()
            personList.clear()
            personList.addAll(persons)
            adapter.notifyDataSetChanged()
        }
    }

    private fun showDeleteConfirmation(person: Person) {
        AlertDialog.Builder(this)
            .setTitle(getString(com.glassface.R.string.delete_person))
            .setMessage(getString(com.glassface.R.string.delete_person_confirmation, person.name))
            .setPositiveButton(getString(com.glassface.R.string.delete)) { _, _ ->
                deletePerson(person)
            }
            .setNegativeButton(getString(com.glassface.R.string.cancel), null)
            .show()
    }

    private fun deletePerson(person: Person) {
        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@AdminActivity)
            database.personDao().deletePerson(person)
            Toast.makeText(
                this@AdminActivity,
                getString(com.glassface.R.string.person_deleted, person.name),
                Toast.LENGTH_SHORT
            ).show()
            loadPersons()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
