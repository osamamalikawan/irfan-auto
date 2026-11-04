package pk.irfanautos.salesman.data

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import pk.irfanautos.salesman.App

/** `offline` is true when the phone could not reach the server at all (no data, timeout): such requests are kept and retried later. */
class ApiException(val code: Int, message: String, val offline: Boolean = false) : Exception(message)

/** The result of loading something for a screen. */
sealed class Load<out T> {
    object Loading : Load<Nothing>()
    data class Ok<T>(val value: T) : Load<T>()
    data class Err(val message: String, val offline: Boolean = false) : Load<Nothing>()
}

suspend fun <T> load(block: suspend () -> T): Load<T> = try {
    Load.Ok(block())
} catch (e: CancellationException) {
    throw e
} catch (e: ApiException) {
    Load.Err(e.message ?: "Something went wrong.", e.offline)
} catch (e: Exception) {
    Load.Err("The server sent an answer this app could not read. Update the app or try again.")
}

object Api {
    val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true }
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(40, TimeUnit.SECONDS).writeTimeout(40, TimeUnit.SECONDS).build()

    private suspend fun raw(method: String, path: String, body: String? = null, auth: Boolean = true): String = withContext(Dispatchers.IO) {
        val base = App.prefs.server
        if (base.isBlank()) throw ApiException(0, "Enter the server address first.")
        try {
            val rb = Request.Builder().url(base + path).header("Accept", "application/json")
            if (auth) App.prefs.token?.let { rb.header("Authorization", "Bearer $it") }
            val payload = body?.toRequestBody(JSON_TYPE) ?: if (method == "POST") "{}".toRequestBody(JSON_TYPE) else null
            rb.method(method, payload)
            client.newCall(rb.build()).execute().use { r ->
                val text = r.body?.string().orEmpty()
                if (r.isSuccessful) return@withContext text
                val msg = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                if (r.code == 401 && auth) {
                    App.prefs.token = null
                    Session.refresh()
                }
                throw ApiException(r.code, msg ?: "The server answered with an error (${r.code}).")
            }
        } catch (e: IllegalArgumentException) {
            throw ApiException(0, "The server address is not valid. Example: https://your-site.vercel.app")
        } catch (e: IOException) {
            throw ApiException(-1, "No connection. Check your internet and try again.", offline = true)
        }
    }

    private suspend inline fun <reified T> get(path: String): T = json.decodeFromString(raw("GET", path))
    private suspend inline fun <reified T> post(path: String, body: String? = null, auth: Boolean = true): T = json.decodeFromString(raw("POST", path, body, auth))
    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    // ---- sign in
    suspend fun users(): List<UserItem> = get<UsersResp>("/api/auth/users").users
    suspend fun login(userId: String, pin: String): LoginResp = post(
        "/api/auth/login", buildJsonObject { put("userId", userId); put("pin", pin); put("client", "app") }.toString(), auth = false,
    )
    suspend fun changePin(current: String, next: String) {
        raw("POST", "/api/auth/pin", buildJsonObject { put("current", current); put("next", next) }.toString())
    }

    // ---- attendance and location
    suspend fun today(): TodayResp = get("/api/attendance/today")
    private fun fixBody(f: Fix) = buildJsonObject { put("lat", f.lat); put("lng", f.lng); put("accuracy", f.accuracy) }.toString()
    suspend fun checkIn(f: Fix) { raw("POST", "/api/attendance", fixBody(f)) }
    suspend fun checkOut(f: Fix) { raw("POST", "/api/attendance/check-out", fixBody(f)) }
    suspend fun sendPings(p: List<Ping>): PingsAck = post("/api/location", json.encodeToString(PingsBody(p)))

    // ---- reading
    suspend fun myCustomers(): List<MyCustomer> = get<MyCustomersResp>("/api/me/customers").items
    suspend fun ledger(customerId: String): LedgerResp = get("/api/customers/$customerId/ledger")
    suspend fun products(q: String): List<Product> = get<ProductsResp>("/api/inventory/products?limit=25&q=" + enc(q)).items
    suspend fun methods(): List<Method> = get<MethodsResp>("/api/payment-methods").methods
    suspend fun sales(customerId: String): List<SaleSummary> = get<SalesResp>("/api/sales?limit=30&customer=$customerId").items
    suspend fun returnable(saleId: String): List<RetItem> = get<ReturnableResp>("/api/sales/$saleId/returnable").items
    suspend fun account(range: String): JsonObject = json.parseToJsonElement(raw("GET", "/api/me/account?range=$range")).jsonObject

    // ---- requests (the office approves them)
    suspend fun createRequest(type: String, body: String): Created = post("/api/requests/$type", body)
    suspend fun requests(type: String): List<RequestRow> = get<RequestsResp>("/api/requests/$type?limit=50").items
    suspend fun cancelRequest(type: String, id: String) { raw("POST", "/api/requests/$type/$id/cancel") }
}
