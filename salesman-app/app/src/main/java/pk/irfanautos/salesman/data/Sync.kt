package pk.irfanautos.salesman.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import pk.irfanautos.salesman.App

object Sync {
    // Only one upload at a time: two uploads reading the same waiting points would send them twice and then both delete them.
    private val uploadLock = Mutex()

    /** Sends the waiting "location turned off / on" moments. */
    private suspend fun uploadEvents() {
        while (true) {
            val batch = Events.peek(50)
            if (batch.isEmpty()) return
            try {
                Api.sendEvents(batch)
                Events.drop(batch.size)
            } catch (e: ApiException) {
                if (!e.offline && e.code in 400..499 && e.code != 401 && e.code != 429) Events.drop(batch.size)
                return
            }
        }
    }

    /** Uploads the waiting location points (and location-off moments). Returns what the server says about "on duty"
     *  (false = he is not checked in), or null if the server could not be reached. */
    suspend fun uploadPings(): Boolean? = uploadLock.withLock {
        uploadEvents()
        var onDuty: Boolean? = null
        var more = true
        while (more) {
            val batch = Pings.peek(200)
            if (batch.isEmpty()) break
            try {
                val ack = Api.sendPings(batch)
                Pings.drop(batch.size)
                onDuty = ack.on_duty
            } catch (e: ApiException) {
                // a point the server refuses (not signed in, not on duty) is not worth keeping; a lost connection is retried
                if (!e.offline && e.code in 400..499 && e.code != 401 && e.code != 429) Pings.drop(batch.size)
                more = false
            }
        }
        onDuty
    }

    /** Everything that is waiting goes out in the order it happened (start of work, visits, requests, end of work), then the location points,
     *  then the phone's own data is brought up to date. Runs the moment internet comes back. Returns the server's "on duty" answer, or null. */
    suspend fun runAll(forcePack: Boolean = false): Boolean? = withContext(Dispatchers.IO) { // never on the screen's thread: it writes to the phone's database
        if (App.prefs.token == null) return@withContext null
        Outbox.flush()
        val onDuty = uploadPings()
        Offline.refresh(forcePack)
        onDuty
    }

    /** Asks Android to send what is waiting as soon as there is internet, even if the app is closed. */
    fun schedule(ctx: Context = App.ctx) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE, req)
    }
}

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (App.prefs.token == null) return Result.success()
        Sync.runAll()
        return if (Outbox.waiting() > 0 || Pings.count() > 0) Result.retry() else Result.success()
    }
}
