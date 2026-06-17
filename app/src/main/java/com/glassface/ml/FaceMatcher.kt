package com.glassface.ml

import com.glassface.db.PersonDao
import com.glassface.util.EmbeddingUtils

data class MatchResult(
    val personId: Long,
    val name: String,
    val similarity: Float
)

class FaceMatcher(private val personDao: PersonDao) {

    private val similarityThreshold = 0.65f

    suspend fun findBestMatch(embedding: FloatArray): MatchResult? {
        val allEmbeddings = personDao.getAllEmbeddings()

        var bestMatch: MatchResult? = null
        var bestSimilarity = -1f

        for (storedEmbedding in allEmbeddings) {
            val storedFloats = EmbeddingUtils.byteArrayToFloatArray(storedEmbedding.embedding)
            val similarity = EmbeddingUtils.cosineSimilarity(embedding, storedFloats)

            if (similarity > bestSimilarity) {
                bestSimilarity = similarity
                if (similarity >= similarityThreshold) {
                    val person = personDao.getPersonById(storedEmbedding.personId)
                    if (person != null) {
                        bestMatch = MatchResult(
                            personId = storedEmbedding.personId,
                            name = person.name,
                            similarity = similarity
                        )
                    }
                }
            }
        }

        return bestMatch
    }
}
