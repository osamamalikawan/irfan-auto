package pk.irfanautos.salesman

import android.app.Application
import android.content.Context
import pk.irfanautos.salesman.data.Prefs
import pk.irfanautos.salesman.data.Session

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        ctx = applicationContext
        prefs = Prefs(applicationContext)
        Session.refresh()
    }

    companion object {
        lateinit var ctx: Context
        lateinit var prefs: Prefs
    }
}
