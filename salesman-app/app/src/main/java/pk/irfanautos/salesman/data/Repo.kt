package pk.irfanautos.salesman.data

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.App

/** Everything the salesman does is saved here first, on the phone, in the order he did it, and sent as soon as there is internet.
 *  Types: orders, payments, returns (to the office for approval), visit, att_start, att_end (start / end of work). */
object Outbox {
    private val mutex = Mutex()

    /** The office number (ORQ-0007...) of requests sent just now, so the screen can show it. */
    val sentNo = ConcurrentHashMap<String, String>()

    fun all(): List<OutboxItem> = runCatching { Api.json.decodeFromString<List<OutboxItem>>(App.prefs.outbox) }.getOrDefault(emptyList())
    private fun save(list: List<OutboxItem>) { App.prefs.outbox = Api.json.encodeToString(list) }

    @Synchronized fun add(item: OutboxItem) = save(all() + item)
    @Synchronized fun remove(id: String) = save(all().filter { it.id != id })
    @Synchronized private fun markError(id: String, message: String) = save(all().map { if (it.id == id) it.copy(error = message) else it })

    fun waiting(): Int = all().count { it.error == null }
    fun hasAttendance(): Boolean = all().any { it.type == "att_start" || it.type == "att_end" }

    fun title(type: String): String = when (type) {
        "orders" -> "Order"
        "payments" -> "Payment"
        "returns" -> "Return / claim"
        "visit" -> "Visit"
        "att_start" -> "Start work"
        "att_end" -> "End work"
        "task_add" -> "New task"
        "task_done" -> "Task update"
        "sale_task" -> "Order action"
        else -> type
    }

    private fun path(type: String): String = when (type) {
        "visit" -> "/api/visits"
        "att_start" -> "/api/attendance"
        "att_end" -> "/api/attendance/check-out"
        "task_add" -> "/api/tasks"
        else -> "/api/requests/$type"
    }

    /** Sends everything waiting, oldest first. Returns true when nothing is left that a retry could still send. */
    suspend fun flush(): Boolean = mutex.withLock {
        for (item in all()) {
            if (item.error != null) continue
            try {
                val answer = Api.sendRaw(item.method ?: "POST", item.path ?: path(item.type), item.body)
                if (item.type == "orders" || item.type == "payments" || item.type == "returns") {
                    runCatching { sentNo[item.id] = Api.json.decodeFromString<Created>(answer).no }
                }
                remove(item.id)
            } catch (e: ApiException) {
                // no connection, signed out, busy or a server fault: keep it and try again later
                if (e.offline || e.code == 401 || e.code == 429 || e.code >= 500) return@withLock false
                // refused by the office system: a repeated start / end of work needs no action, anything else stays visible so it can be deleted
                if (item.type == "att_start" || item.type == "att_end" || item.type == "task_done") remove(item.id) else markError(item.id, e.message ?: "Rejected")
            }
        }
        true
    }
}

/** Location points waiting to be uploaded. */
object Pings {
    @Synchronized private fun read(): List<Ping> = runCatching { Api.json.decodeFromString<List<Ping>>(App.prefs.pings) }.getOrDefault(emptyList())

    @Synchronized fun add(p: Ping) {
        App.prefs.pings = Api.json.encodeToString(read().takeLast(2999) + p)
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

    /** Saves a request on the phone and sends it right away when there is internet. If there is none it simply waits (Queued) and goes out by itself. */
    suspend fun send(type: String, body: JsonObject, customerName: String): SubmitResult {
        val key = body["idem_key"]?.jsonPrimitive?.content ?: newKey()
        Outbox.add(OutboxItem(key, type, body.toString(), customerName, System.currentTimeMillis()))
        Outbox.flush()
        val left = Outbox.all().firstOrNull { it.id == key }
        return when {
            left == null -> SubmitResult.Sent(Outbox.sentNo.remove(key) ?: "")
            left.error != null -> {
                Outbox.remove(key)
                SubmitResult.Failed(left.error)
            }
            else -> {
                Sync.schedule()
                SubmitResult.Queued
            }
        }
    }

    /** Saves something on the phone (visit, start / end of work) and sends it in the background: the screen never waits for the internet. */
    fun queue(type: String, body: JsonObject, label: String, path: String? = null, method: String? = null) {
        val key = body["idem_key"]?.jsonPrimitive?.content ?: newKey()
        Outbox.add(OutboxItem(key, type, body.toString(), label, System.currentTimeMillis(), path = path, method = method))
        App.scope.launch { Sync.runAll() }
        Sync.schedule()
    }

    /** The fields every request carries: where the phone was. */
    fun common(b: JsonObjectBuilder) {
        App.prefs.recentFix()?.let { b.put("lat", it.lat); b.put("lng", it.lng) }
    }

    fun withKey(build: JsonObjectBuilder.() -> Unit): JsonObject = buildJsonObject {
        build()
        common(this)
        put("idem_key", newKey())
    }
}
