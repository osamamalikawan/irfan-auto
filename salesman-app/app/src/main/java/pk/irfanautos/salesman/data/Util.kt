package pk.irfanautos.salesman.data

import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val PK: ZoneId = ZoneId.of("Asia/Karachi")

fun money(v: Double): String = "Rs " + String.format(Locale.US, "%,.0f", v)

fun qtyText(v: Double): String = if (v == Math.floor(v)) v.toLong().toString() else v.toString()

fun parseTime(iso: String?): OffsetDateTime? = if (iso.isNullOrBlank()) null else runCatching { OffsetDateTime.parse(iso) }.getOrNull()

fun fmtTime(iso: String?): String =
    parseTime(iso)?.atZoneSameInstant(PK)?.format(DateTimeFormatter.ofPattern("HH:mm", Locale.US)) ?: "-"

fun fmtDateTime(iso: String?): String =
    parseTime(iso)?.atZoneSameInstant(PK)?.format(DateTimeFormatter.ofPattern("dd MMM, HH:mm", Locale.US)) ?: "-"

/** "2 h 15 min" from a moment until now (or until `toIso`). */
fun durationText(fromIso: String?, toIso: String? = null): String {
    val from = parseTime(fromIso) ?: return "-"
    val to = parseTime(toIso) ?: OffsetDateTime.now()
    val m = Duration.between(from, to).toMinutes().coerceAtLeast(0)
    return "${m / 60} h ${m % 60} min"
}
