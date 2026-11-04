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
import pk.irfanautos.salesman.App

object Sync {
    /** Uploads the waiting location points. Returns what the server says about "on duty" (false = he is not checked in, stop tracking),
     *  or null if the server could not be reached. */
    suspend fun uploadPings(): Boolean? {
        var onDuty: Boolean? = null
        while (true) {
            val batch = Pings.peek(200)
            if (batch.isEmpty()) return onDuty
            try {
                val ack = Api.sendPings(batch)
                Pings.drop(batch.size)
                onDuty = ack.on_duty
            } catch (e: ApiException) {
                // a point the server refuses (not signed in, not on duty) is not worth keeping; a lost connection is retried
                if (!e.offline && e.code in 400..499 && e.code != 401 && e.code != 429) Pings.drop(batch.size)
                return onDuty
            }
        }
    }

    /** Asks Android to send the queued requests and points as soon as there is internet, even if the app is closed. */
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
        val done = Outbox.flush()
        Sync.uploadPings()
        return if (done) Result.success() else Result.retry()
    }
}
