package pk.irfanautos.salesman.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import pk.irfanautos.salesman.App

/** Everything the salesman needs without internet: his customers and their accounts, the parts list, payment methods and the visit plan.
 *  It is downloaded whenever there is internet (see refresh) and read from the phone's database. */
object Offline {
    /** Screens watch this: it changes whenever new data was saved, so they reload from the phone. */
    var version by mutableStateOf(0)
        private set
    var syncing by mutableStateOf(false)
        private set
    var syncText by mutableStateOf("")
        private set

    private val lock = Mutex()
    private val db get() = App.localDb
    private inline fun <reified T> read(key: String): T? = db.get(key)?.let { runCatching { Api.json.decodeFromString<T>(it) }.getOrNull() }
    private inline fun <reified T> write(key: String, value: T) = db.put(key, Api.json.encodeToString(value))

    // ---- reading (works with no internet)
    fun customers(): List<MyCustomer> = read<List<MyCustomer>>("customers") ?: emptyList()
    fun customer(id: String): MyCustomer? = customers().firstOrNull { it.id == id }
    fun methods(): List<Method> = read<List<Method>>("methods") ?: emptyList()
    fun plan(): PlanData? = read<PlanData>("plan")
    fun tasks(): TasksPack? = read<TasksPack>("tasks")
    /** May this salesman tick off the office's scheduled order actions (pack / deliver)? Decided by his permissions on the website. */
    fun canSaleStatus(): Boolean = read<PackCan>("can")?.sale_status == true
    /** An invoice from the phone: first from the customer's saved account, then from one opened earlier. */
    fun invoiceDoc(customerId: String?, key: String): InvoiceDoc? {
        if (customerId != null) snap(customerId)?.docs?.firstOrNull { it.id == key || it.no == key }?.let { return it }
        return read<InvoiceDoc>("inv:$key")
    }
    fun lastVisits(): Map<String, LastVisit> = read<Map<String, LastVisit>>("last_visits") ?: emptyMap()
    fun snap(customerId: String): CustomerSnap? = read<CustomerSnap>("snap:$customerId")
    fun searchProducts(q: String): List<Product> = db.searchProducts(q)
    fun productCount(): Int = db.productCount()
    fun hasData(): Boolean = db.get("customers") != null
    fun updatedAt(): Long = App.prefs.packAt

    // ---- small updates made on the phone
    /** The visit he just recorded counts at once (the plan shows it done) even before it is sent. */
    fun recordDone(customerId: String, outcome: String, notes: String?) {
        val p = plan() ?: return
        write("plan", p.copy(done_today = p.done_today + (customerId to DoneVisit(outcome, notes))))
        version++
    }

    /** Opens an older invoice from the website (when there is internet) and keeps it on the phone. */
    suspend fun fetchInvoice(key: String): InvoiceDoc? = try {
        Api.invoice(key)?.also { d ->
            write("inv:" + d.id, d)
            write("inv:" + d.no, d)
            version++
        }
    } catch (e: Exception) {
        null
    }

    // ---- tasks changed on the phone (shown at once, sent later)
    fun addLocalTask(t: TaskRow) {
        val p = tasks() ?: TasksPack(todayPk())
        write("tasks", p.copy(items = p.items + t))
        version++
    }

    fun setTaskDone(id: String, done: Boolean) {
        val p = tasks() ?: return
        write("tasks", p.copy(items = p.items.map { if (it.id == id) it.copy(done = done) else it }))
        version++
    }

    private fun updateBalance(customerId: String, balance: Double) {
        val list = customers()
        if (list.none { it.id == customerId && it.balance != balance }) return
        write("customers", list.map { if (it.id == customerId) it.copy(balance = balance) else it })
        version++
    }

    /** Opens a customer's account with fresh numbers when there is internet (the saved copy is shown meanwhile). */
    suspend fun refreshLedger(customerId: String): Boolean = try {
        val l = Api.ledger(customerId)
        val old = snap(customerId)
        write(
            "snap:$customerId",
            CustomerSnap(
                customer_id = customerId, balance = l.balance, credit_limit = l.customer?.credit_limit ?: old?.credit_limit ?: 0.0, opening = l.opening, closing = l.closing,
                rows = l.rows.takeLast(40), unpaid = l.unpaid, invoices = old?.invoices ?: emptyList(), docs = old?.docs ?: emptyList(),
            ),
        )
        updateBalance(customerId, l.balance)
        version++
        true
    } catch (e: Exception) {
        false
    }

    // ---- downloading
    /** Brings the phone up to date. Skipped when the data is recent, unless `force`. Returns false if there was no internet. */
    suspend fun refresh(force: Boolean = false): Boolean = lock.withLock {
        val prefs = App.prefs
        if (prefs.token == null) return@withLock false
        val now = System.currentTimeMillis()
        if (!force && hasData() && now - prefs.packAt < 20 * 60_000L) return@withLock true
        syncing = true
        try {
            syncText = "Updating customers and plan..."
            val base = Api.offlineBase()
            write("customers", base.customers)
            write("methods", base.methods)
            write("plan", base.plan)
            write("last_visits", base.last_visits)
            write("can", base.can)
            prefs.packAt = now
            version++
            try {
                write("tasks", Api.offlineTasks()) // a problem with tasks must not stop the rest from downloading
                version++
            } catch (e: ApiException) {
                if (e.offline) throw e
            }

            if (force || db.productCount() == 0 || now - prefs.productsAt > 6 * 3600_000L) {
                syncText = "Updating parts list..."
                val all = ArrayList<Product>()
                var off: Int? = 0
                while (off != null) {
                    val page = Api.offlineProducts(off)
                    all.addAll(page.items)
                    syncText = "Updating parts list... ${all.size}/${page.total}"
                    off = page.next_offset
                }
                db.replaceProducts(all)
                prefs.productsAt = System.currentTimeMillis()
                version++
            }

            val missing = base.customers.any { db.get("snap:" + it.id) == null }
            if (force || missing || now - prefs.snapsAt > 2 * 3600_000L) {
                var off: Int? = 0
                var done = 0
                while (off != null) {
                    val page = Api.offlineCustomers(off)
                    for (s in page.items) write("snap:" + s.customer_id, s)
                    done += page.items.size
                    syncText = "Updating customer accounts... $done/${page.total}"
                    off = page.next_offset
                }
                prefs.snapsAt = System.currentTimeMillis()
                version++
            }
            true
        } catch (e: Exception) {
            false
        } finally {
            syncText = ""
            syncing = false
        }
    }

    /** Forget everything (another person signed in on this phone). */
    fun clear() {
        db.clearAll()
        App.prefs.packAt = 0
        App.prefs.productsAt = 0
        App.prefs.snapsAt = 0
        version++
    }
}
