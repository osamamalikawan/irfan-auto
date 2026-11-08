package pk.irfanautos.salesman.data

import kotlinx.serialization.Serializable

@Serializable data class UserItem(val id: String = "", val name: String = "")
@Serializable data class UsersResp(val users: List<UserItem> = emptyList())
@Serializable data class LoginResp(val ok: Boolean = false, val mustChangePin: Boolean = false, val token: String? = null)

@Serializable data class Attendance(val check_in_at: String = "", val check_out_at: String? = null)
@Serializable data class TodayResp(val attendance: Attendance? = null, val on_duty: Boolean = false)
@Serializable data class PingsAck(val accepted: Int = 0, val ignored: Int = 0, val on_duty: Boolean = false)

@Serializable data class MyCustomer(
    val id: String = "", val code: String? = null, val name: String = "", val name_ur: String? = null, val phone: String? = null,
    val credit_limit: Double = 0.0, val area: String? = null, val route: String? = null, val balance: Double = 0.0,
)
@Serializable data class MyCustomersResp(val items: List<MyCustomer> = emptyList(), val count: Int = 0, val total_owing: Double = 0.0)

@Serializable data class LedgerCustomer(val id: String = "", val name: String = "", val credit_limit: Double = 0.0)
@Serializable data class LedgerRow(val date: String = "", val type: String = "", val label: String = "", val debit: Double = 0.0, val credit: Double = 0.0, val balance: Double = 0.0)
@Serializable data class Unpaid(val no: String = "", val due: Double = 0.0, val total: Double = 0.0, val ts: String = "")
@Serializable data class LedgerResp(
    val customer: LedgerCustomer? = null, val balance: Double = 0.0, val opening: Double = 0.0, val closing: Double = 0.0,
    val rows: List<LedgerRow> = emptyList(), val unpaid: List<Unpaid> = emptyList(),
)

@Serializable data class Product(
    val id: String = "", val name_en: String = "", val code_name: String? = null, val name_ur: String? = null, val scheme: String? = null,
    val cp: Double = 0.0, val unit: String? = null, val on_hand: Double = 0.0, val brand: String? = null,
)
@Serializable data class ProductsResp(val items: List<Product> = emptyList(), val total: Int = 0)

@Serializable data class Method(val id: String = "", val name: String = "")
@Serializable data class MethodsResp(val methods: List<Method> = emptyList())

@Serializable data class SaleSummary(
    val id: String = "", val no: String = "", val sale_date: String? = null, val total: Double = 0.0, val paid: Double = 0.0,
    val status: String = "", val fulfil_status: String? = null,
)
@Serializable data class SalesResp(val items: List<SaleSummary> = emptyList(), val total: Int = 0)

@Serializable data class RetItem(val id: String = "", val name: String = "", val sold: Double = 0.0, val returned: Double = 0.0, val remaining: Double = 0.0, val net_unit: Double = 0.0)
@Serializable data class ReturnableResp(val items: List<RetItem> = emptyList())

@Serializable data class Created(val id: String = "", val no: String = "", val status: String = "", val duplicate: Boolean = false)

@Serializable data class ReqLine(val name: String = "", val qty: Double = 0.0, val price: Double = 0.0)
@Serializable data class SaleRef(val no: String = "", val total: Double = 0.0)
@Serializable data class RequestRow(
    val id: String = "", val no: String = "", val status: String = "", val customer_name: String = "", val created_at: String = "",
    val review_note: String? = null, val lines: List<ReqLine> = emptyList(), val amount: Double = 0.0, val method: String? = null,
    val kind: String? = null, val term: String? = null, val sale_no: String? = null, val sale: SaleRef? = null,
)
@Serializable data class RequestsResp(val items: List<RequestRow> = emptyList(), val total: Int = 0)

/** A request that could not be sent because the phone was offline; it is sent later with the same idem_key, so it can never be doubled. */
@Serializable data class OutboxItem(val id: String, val type: String, val body: String, val customer: String, val at: Long, val error: String? = null)

@Serializable data class Ping(val lat: Double, val lng: Double, val accuracy: Double? = null, val ts: Long, val battery: Int? = null)
@Serializable data class PingsBody(val pings: List<Ping>)

/** "location_off" / "location_on" / "permission_off" / "permission_on": reported to the office so it can see when location was switched off. */
@Serializable data class LocEvent(val type: String, val ts: Long)
@Serializable data class EventsBody(val events: List<LocEvent>)

// ---- the offline pack (downloaded while online, used without internet)
@Serializable data class PlanRoute(val id: String = "", val name: String = "", val code: String? = null, val frequency: String = "", val customer_ids: List<String> = emptyList())
@Serializable data class PlanDay(val date: String = "", val routes: List<PlanRoute> = emptyList())
@Serializable data class DoneVisit(val outcome: String = "", val notes: String? = null)
@Serializable data class PlanData(val today: String = "", val days: List<PlanDay> = emptyList(), val done_today: Map<String, DoneVisit> = emptyMap())
@Serializable data class LastVisit(val date: String = "", val outcome: String = "", val notes: String? = null)
@Serializable data class BasePack(
    val server_time: String = "", val customers: List<MyCustomer> = emptyList(), val methods: List<Method> = emptyList(),
    val plan: PlanData = PlanData(), val last_visits: Map<String, LastVisit> = emptyMap(),
)
@Serializable data class InvoiceSnap(val id: String = "", val no: String = "", val sale_date: String? = null, val total: Double = 0.0, val items: List<RetItem> = emptyList())
@Serializable data class CustomerSnap(
    val customer_id: String = "", val balance: Double = 0.0, val credit_limit: Double = 0.0, val opening: Double = 0.0, val closing: Double = 0.0,
    val rows: List<LedgerRow> = emptyList(), val unpaid: List<Unpaid> = emptyList(), val invoices: List<InvoiceSnap> = emptyList(),
)
@Serializable data class SnapPage(val items: List<CustomerSnap> = emptyList(), val total: Int = 0, val next_offset: Int? = null)
@Serializable data class ProductsPage(val items: List<Product> = emptyList(), val total: Int = 0, val next_offset: Int? = null)
