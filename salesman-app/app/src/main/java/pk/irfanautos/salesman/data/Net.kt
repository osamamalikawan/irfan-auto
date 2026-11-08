package pk.irfanautos.salesman.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Is there internet right now? The screens show an "Offline" badge when not. */
object Net {
    var online by mutableStateOf(true)

    fun check(ctx: Context) {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    }
}
