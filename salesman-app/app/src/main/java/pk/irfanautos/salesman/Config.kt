package pk.irfanautos.salesman

/**
 * THE ONE PLACE TO SET THE WEBSITE ADDRESS.
 * Write the address of your deployed website, for example  https://irfan-auto.vercel.app
 * Only the address: no page name after it (not /login, not /dashboard).
 */
object Config {
    const val SERVER_URL = "https://irfan-auto.vercel.app"

    /** scheme + host only, so a page name added by mistake can never cause a "404 not found". Empty when not set. */
    val baseUrl: String
        get() {
            val raw = SERVER_URL.trim()
            if (raw.isEmpty() || raw.startsWith("PUT-YOUR")) return ""
            return runCatching {
                val u = java.net.URI(if (raw.contains("://")) raw else "https://$raw")
                if (u.host == null) "" else u.scheme + "://" + u.authority
            }.getOrDefault("")
        }
}