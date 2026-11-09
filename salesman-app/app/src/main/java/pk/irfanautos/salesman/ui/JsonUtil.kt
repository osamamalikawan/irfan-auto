package pk.irfanautos.salesman.ui

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

// The account answer is read field by field, so a small change on the server never stops a screen from opening.
internal fun JsonElement?.obj(k: String): JsonObject? = (this as? JsonObject)?.get(k) as? JsonObject
internal fun JsonElement?.num(k: String): Double = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.doubleOrNull ?: 0.0
internal fun JsonElement?.text(k: String): String? = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.contentOrNull
internal fun JsonElement?.list(k: String): List<JsonObject> = ((this as? JsonObject)?.get(k) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
