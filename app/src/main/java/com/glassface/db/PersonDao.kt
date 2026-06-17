package com.glassface.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface PersonDao {

    @Query("SELECT * FROM persons ORDER BY name ASC")
    suspend fun getAllPersons(): List<Person>

    @Query("SELECT * FROM persons WHERE id = :id LIMIT 1")
    suspend fun getPersonById(id: Long): Person?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPerson(person: Person): Long

    @Update
    suspend fun updatePerson(person: Person)

    @Delete
    suspend fun deletePerson(person: Person)

    @Query("SELECT * FROM face_embeddings")
    suspend fun getAllEmbeddings(): List<FaceEmbedding>

    @Query("SELECT * FROM face_embeddings WHERE personId = :personId")
    suspend fun getEmbeddingsByPersonId(personId: Long): List<FaceEmbedding>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEmbedding(embedding: FaceEmbedding): Long

    @Query("DELETE FROM face_embeddings WHERE personId = :personId")
    suspend fun deleteEmbeddingsByPersonId(personId: Long)
}
