package pk.irfanautos.salesman

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.data.LocalDb
import pk.irfanautos.salesman.data.Net
import pk.irfanautos.salesman.data.Prefs
import pk.irfanautos.salesman.data.Session
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.location.TrackingService

class App : Application() {
    private var lastTrigger = 0L

    override fun onCreate() {
        super.onCreate()
        ctx = applicationContext
        prefs = Prefs(applicationContext)
        localDb = LocalDb(applicationContext)
        Session.refresh()
        Net.check(applicationContext)
        watchNetwork()
    }

    /** The moment internet comes back: send everything that was saved on the phone, and report the current location straight away. */
    private fun trigger() {
        val now = System.currentTimeMillis()
        if (now - lastTrigger < 3000) return
        lastTrigger = now
        scope.launch {
            delay(1000) // let the connection settle
            TrackingService.instance?.captureNow()
            Sync.runAll()
        }
    }

    private fun watchNetwork() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        try {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    trigger()
                }

                override fun onLost(network: Network) {
                    Net.online = false
                }

                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val ok = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    val was = Net.online
                    Net.online = ok
                    if (ok && !was) trigger()
                }
            })
        } catch (e: Exception) {
            // without the watcher the phone still sends everything when the app is opened or the next location point is taken
        }
    }

    companion object {
        lateinit var ctx: Context
        lateinit var prefs: Prefs
        lateinit var localDb: LocalDb
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
