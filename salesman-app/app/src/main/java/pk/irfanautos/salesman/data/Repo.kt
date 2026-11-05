package pk.irfanautos.salesman.data

import java.util.UUID
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.App

/** Lists the screens need. The last answer is kept on the phone so customers and payment methods still show without internet. */
data class Cached<T>(val value: T, val fromCache: Boolean = false)

object Repo {
    suspend fun customers(): Cached<List<MyCustomer>> = try {
        val list = Api.myCustomers()
        App.prefs.customersCache = Api.json.encodeToString(list)
        Cached(list)
    } catch (e: ApiException) {
        val cached = if (e.offline) runCatching { Api.json.decodeFromString<List<MyCustomer>>(App.prefs.customersCache ?: "") }.getOrNull() else null
        if (cached != null) Cached(cached, fromCache = true) else throw e
    }

    suspend fun methods(): Cached<List<Method>> = try {
        val list = Api.methods()
        App.prefs.methodsCache = Api.json.encodeToString(list)
        Cached(list)
    } catch (e: ApiException) {
        val cached = if (e.offline) runCatching { Api.json.decodeFromString<List<Method>>(App.prefs.methodsCache ?: "") }.getOrNull() else null
        if (cached != null) Cached(cached, fromCache = true) else throw e
    }
}

/** Requests that could not be sent (no internet). */
object Outbox {
    private val mutex = Mutex()

    fun all(): List<OutboxItem> = runCatching { Api.json.decodeFromString<List<OutboxItem>>(App.prefs.outbox) }.getOrDefault(emptyList())
    private fun save(list: List<OutboxItem>) { App.prefs.outbox = Api.json.encodeToString(list) }

    @Synchronized fun add(item: OutboxItem) = save(all() + item)
    @Synchronized fun remove(id: String) = save(all().filter { it.id != id })
    @Synchronized private fun markError(id: String, message: String) = save(all().map { if (it.id == id) it.copy(error = message) else it })

    fun waiting(): Int = all().count { it.error == null }

    /** Sends everything waiting. Returns true when nothing is left that a retry could still send. */
    suspend fun flush(): Boolean = mutex.withLock {
        for (item in all()) {
            if (item.error != null) continue
            try {
                Api.createRequest(item.type, item.body)
                remove(item.id)
            } catch (e: ApiException) {
                // no connection, signed out, busy or a server fault: keep it and try again later
                if (e.offline || e.code == 401 || e.code == 429 || e.code >= 500) return@withLock false
                // the office system said no (for example the customer is no longer yours): keep it visible so it can be deleted
                markError(item.id, e.message ?: "Rejected")
            }
        }
        true
    }
}

/** Location points waiting to be uploaded. */
object Pings {
    @Synchronized private fun read(): List<Ping> = runCatching { Api.json.decodeFromString<List<Ping>>(App.prefs.pings) }.getOrDefault(emptyList())

    @Synchronized fun add(p: Ping) {
        App.prefs.pings = Api.json.encodeToString(read().takeLast(1999) + p)
    }

    @Synchronized fun peek(n: Int): List<Ping> = read().take(n)

    @Synchronized fun drop(n: Int) {
        App.prefs.pings = Api.json.encodeToString(read().drop(n))
    }

    @Synchronized fun count(): Int = read().size
}

/** Location-off / location-on moments waiting to be uploaded. */
object Events {
    @Synchronized private fun read(): List<LocEvent> = runCatching { Api.json.decodeFromString<List<LocEvent>>(App.prefs.events) }.getOrDefault(emptyList())

    @Synchronized fun add(type: String, ts: Long = System.currentTimeMillis()) {
        App.prefs.events = Api.json.encodeToString(read().takeLast(199) + LocEvent(type, ts))
    }

    @Synchronized fun peek(n: Int): List<LocEvent> = read().take(n)

    @Synchronized fun drop(n: Int) {
        App.prefs.events = Api.json.encodeToString(read().drop(n))
    }
}

sealed class SubmitResult {
    data class Sent(val no: String) : SubmitResult()
    object Queued : SubmitResult()
    data class Failed(val message: String) : SubmitResult()
}

object Submit {
    fun newKey(): String = UUID.randomUUID().toString()

    /** Sends a request now; if there is no internet it is saved on the phone and sent later (the same key makes a double impossible). */
    suspend fun send(type: String, body: JsonObject, customerName: String): SubmitResult {
        val key = body["idem_key"]?.jsonPrimitive?.content ?: newKey()
        return try {
            SubmitResult.Sent(Api.createRequest(type, body.toString()).no)
        } catch (e: ApiException) {
            if (e.offline) {
                Outbox.add(OutboxItem(key, type, body.toString(), customerName, System.currentTimeMillis()))
                Sync.schedule()
                SubmitResult.Queued
            } else {
                SubmitResult.Failed(e.message ?: "Could not send.")
            }
        }
    }

    /** The fields every request carries: where the phone was, and the key that makes a retry safe. */
    fun common(b: kotlinx.serialization.json.JsonObjectBuilder) {
        App.prefs.recentFix()?.let { b.put("lat", it.lat); b.put("lng", it.lng) }
    }

    fun withKey(build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): JsonObject = buildJsonObject {
        build()
        common(this)
        put("idem_key", newKey())
    }
}
