package com.glassface.ui.admin

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.glassface.R
import com.glassface.databinding.ActivityAddPersonBinding
import com.glassface.db.AppDatabase
import com.glassface.db.FaceEmbedding
import com.glassface.db.Person
import com.glassface.ml.FaceEmbedder
import com.glassface.util.EmbeddingUtils
import com.glassface.util.ImageUtils
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class AddPersonActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddPersonBinding
    private var selectedBitmap: Bitmap? = null
    private var savedPhotoPath: String = ""
    private var editPersonId: Long = -1L

    companion object {
        const val EXTRA_PERSON_ID = "extra_person_id"
    }

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val uri: Uri? = result.data?.data
            if (uri != null) {
                try {
                    val bitmap = MediaStore.Images.Media.getBitmap(contentResolver, uri)
                    selectedBitmap = bitmap
                    binding.ivPhoto.setImageBitmap(bitmap)
                } catch (e: Exception) {
                    Toast.makeText(this, getString(R.string.error_loading_image), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddPersonBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        editPersonId = intent.getLongExtra(EXTRA_PERSON_ID, -1L)

        if (editPersonId != -1L) {
            supportActionBar?.title = getString(R.string.edit_person)
            loadExistingPerson(editPersonId)
        } else {
            supportActionBar?.title = getString(R.string.add_person)
        }

        binding.btnPhoto.setOnClickListener {
            val intent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            pickImageLauncher.launch(intent)
        }

        binding.btnSave.setOnClickListener {
            savePerson()
        }
    }

    private fun loadExistingPerson(personId: Long) {
        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@AddPersonActivity)
            val person = database.personDao().getPersonById(personId)
            if (person != null) {
                binding.etName.setText(person.name)
                binding.etTitle.setText(person.title)
                binding.etCompany.setText(person.company)
                binding.etPhone.setText(person.phone)
                binding.etEmail.setText(person.email)
                binding.etNotes.setText(person.notes)
                savedPhotoPath = person.photoPath
                if (person.photoPath.isNotBlank()) {
                    val bitmap = BitmapFactory.decodeFile(person.photoPath)
                    if (bitmap != null) {
                        binding.ivPhoto.setImageBitmap(bitmap)
                        selectedBitmap = bitmap
                    }
                }
            }
        }
    }

    private fun savePerson() {
        val name = binding.etName.text.toString().trim()
        if (name.isBlank()) {
            binding.tilName.error = getString(R.string.name_required)
            return
        }
        binding.tilName.error = null

        lifecycleScope.launch {
            val database = AppDatabase.getInstance(this@AddPersonActivity)
            val personDao = database.personDao()

            // Save photo if a new one was selected
            if (selectedBitmap != null && (savedPhotoPath.isBlank() || editPersonId == -1L)) {
                savedPhotoPath = ImageUtils.saveBitmapToFile(
                    this@AddPersonActivity,
                    selectedBitmap!!,
                    "person_${System.currentTimeMillis()}.jpg"
                )
            }

            val person = Person(
                id = if (editPersonId != -1L) editPersonId else 0,
                name = name,
                title = binding.etTitle.text.toString().trim(),
                company = binding.etCompany.text.toString().trim(),
                phone = binding.etPhone.text.toString().trim(),
                email = binding.etEmail.text.toString().trim(),
                notes = binding.etNotes.text.toString().trim(),
                photoPath = savedPhotoPath
            )

            val personId = if (editPersonId != -1L) {
                personDao.updatePerson(person)
                editPersonId
            } else {
                personDao.insertPerson(person)
            }

            // Process face embedding if we have a photo
            if (selectedBitmap != null) {
                val faces = detectFaces(selectedBitmap!!)
                if (faces.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(
                            this@AddPersonActivity,
                            getString(R.string.no_face_detected),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    if (editPersonId == -1L) {
                        personDao.deletePerson(person.copy(id = personId))
                    }
                    return@launch
                }

                val face = faces.first()
                val boundingBox = face.boundingBox
                val croppedFace = ImageUtils.cropFace(selectedBitmap!!, boundingBox, 0.2f)
                if (croppedFace != null) {
                    val embedder = FaceEmbedder(this@AddPersonActivity)
                    val embedding = embedder.getEmbedding(croppedFace)
                    embedder.close()

                    // Replace existing embeddings for this person
                    personDao.deleteEmbeddingsByPersonId(personId)
                    personDao.insertEmbedding(
                        FaceEmbedding(
                            personId = personId,
                            embedding = EmbeddingUtils.floatArrayToByteArray(embedding)
                        )
                    )
                }
            }

            runOnUiThread {
                Toast.makeText(
                    this@AddPersonActivity,
                    getString(R.string.person_saved, name),
                    Toast.LENGTH_SHORT
                ).show()
                finish()
            }
        }
    }

    private suspend fun detectFaces(bitmap: Bitmap): List<com.google.mlkit.vision.face.Face> =
        suspendCancellableCoroutine { continuation ->
            val options = FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .build()
            val detector = FaceDetection.getClient(options)
            val inputImage = InputImage.fromBitmap(bitmap, 0)
            detector.process(inputImage)
                .addOnSuccessListener { faces ->
                    detector.close()
                    continuation.resume(faces)
                }
                .addOnFailureListener {
                    detector.close()
                    continuation.resume(emptyList())
                }
        }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
