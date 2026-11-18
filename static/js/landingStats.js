// static/js/landingStats.js — Dynamic Metrics for Landing Page via RPC
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) {
        console.warn('Supabase client not available on landing page.');
        return;
    }

    const elTeachers = document.getElementById('statTeachersTracked');
    const elPulse = document.getElementById('statPulseCompletion');
    const elCritical = document.getElementById('statCriticalAlerts');
    const elReminders = document.getElementById('statPendingReminders');

    try {
        const { data, error } = await window.supabaseClient.rpc('get_public_landing_stats');

        if (error || !data) {
            console.warn('Could not fetch public landing stats:', error?.message);
            return; // Leave default '—' placeholders intact
        }

        const teachersTracked = Number(data.teachers_tracked) || 0;
        const completedPulse = Number(data.completed_pulse) || 0;
        const criticalAlerts = Number(data.critical_alerts) || 0;

        // 1. Teachers Tracked
        if (elTeachers) {
            elTeachers.textContent = String(teachersTracked);
        }

        // 2. Critical Alerts
        if (elCritical) {
            elCritical.textContent = String(criticalAlerts);
        }

        // 3. Pulse Completion (%)
        if (elPulse) {
            const completionRate = teachersTracked > 0 
                ? Math.round((completedPulse / teachersTracked) * 100) 
                : 0;
            elPulse.textContent = `${completionRate}%`;
        }

        // 4. Pending Reminders
        if (elReminders) {
            const pendingReminders = Math.max(0, teachersTracked - completedPulse);
            elReminders.textContent = String(pendingReminders);
        }

    } catch (err) {
        console.warn('Unexpected error fetching landing stats:', err);
        // Leave default '—' placeholders intact
    }
});
