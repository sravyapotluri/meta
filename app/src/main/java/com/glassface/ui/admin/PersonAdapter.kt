package com.glassface.ui.admin

import android.graphics.BitmapFactory
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.glassface.R
import com.glassface.databinding.ItemPersonBinding
import com.glassface.db.Person

class PersonAdapter(
    private val persons: List<Person>,
    private val onClick: (Person) -> Unit,
    private val onLongClick: (Person) -> Unit
) : RecyclerView.Adapter<PersonAdapter.PersonViewHolder>() {

    inner class PersonViewHolder(private val binding: ItemPersonBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(person: Person) {
            binding.tvName.text = person.name

            val subtitle = when {
                person.title.isNotBlank() && person.company.isNotBlank() ->
                    "${person.title} at ${person.company}"
                person.title.isNotBlank() -> person.title
                person.company.isNotBlank() -> person.company
                else -> binding.root.context.getString(R.string.no_details)
            }
            binding.tvSubtitle.text = subtitle

            if (person.photoPath.isNotBlank()) {
                try {
                    val bitmap = BitmapFactory.decodeFile(person.photoPath)
                    if (bitmap != null) {
                        binding.ivPhoto.setImageBitmap(bitmap)
                    } else {
                        binding.ivPhoto.setImageResource(R.drawable.ic_person_placeholder)
                    }
                } catch (e: Exception) {
                    binding.ivPhoto.setImageResource(R.drawable.ic_person_placeholder)
                }
            } else {
                binding.ivPhoto.setImageResource(R.drawable.ic_person_placeholder)
            }

            binding.root.setOnClickListener { onClick(person) }
            binding.root.setOnLongClickListener {
                onLongClick(person)
                true
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PersonViewHolder {
        val binding = ItemPersonBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return PersonViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PersonViewHolder, position: Int) {
        holder.bind(persons[position])
    }

    override fun getItemCount(): Int = persons.size
}
