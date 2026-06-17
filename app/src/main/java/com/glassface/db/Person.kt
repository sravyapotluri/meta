package com.glassface.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "persons")
data class Person(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val title: String = "",
    val company: String = "",
    val phone: String = "",
    val email: String = "",
    val notes: String = "",
    val photoPath: String = ""
)
