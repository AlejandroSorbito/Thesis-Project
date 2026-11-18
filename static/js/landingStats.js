// static/js/landingStats.js — Dynamic Metrics for Landing Page
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
        // Parallel fetch for optimal load speed
        const [teachersRes, assessmentsRes, criticalRes] = await Promise.allSettled([
            // 1. Teachers Tracked (role = 'teacher')
            window.supabaseClient
                .from('profiles')
                .select('id', { count: 'exact' })
                .eq('role', 'teacher'),

            // 2. Assessed Teachers (Distinct teacher_ids who took pulse)
            window.supabaseClient
                .from('burnout_assessments')
                .select('teacher_id'),

            // 3. Critical Alerts (Assessments with risk_index >= 70)
            window.supabaseClient
                .from('burnout_assessments')
                .select('id', { count: 'exact', head: true })
                .gte('risk_index', 70)
        ]);

        // 1. Calculate Teachers Tracked
        let totalTeachers = 0;
        let teachersLoaded = false;
        if (teachersRes.status === 'fulfilled' && !teachersRes.value.error && teachersRes.value.data) {
            totalTeachers = teachersRes.value.count !== null ? teachersRes.value.count : teachersRes.value.data.length;
            if (elTeachers) elTeachers.textContent = String(totalTeachers);
            teachersLoaded = true;
        }

        // 2. Calculate Pulse Completion & Pending Reminders
        if (assessmentsRes.status === 'fulfilled' && !assessmentsRes.value.error && assessmentsRes.value.data) {
            const distinctTeachers = new Set(assessmentsRes.value.data.map(a => a.teacher_id).filter(Boolean));
            const completedCount = distinctTeachers.size;

            if (teachersLoaded && totalTeachers > 0) {
                const completionRate = Math.round((completedCount / totalTeachers) * 100);
                if (elPulse) elPulse.textContent = `${completionRate}%`;

                const pendingReminders = Math.max(0, totalTeachers - completedCount);
                if (elReminders) elReminders.textContent = String(pendingReminders);
            } else if (teachersLoaded && totalTeachers === 0) {
                if (elPulse) elPulse.textContent = '0%';
                if (elReminders) elReminders.textContent = '0';
            }
        }

        // 3. Calculate Critical Alerts
        if (criticalRes.status === 'fulfilled' && !criticalRes.value.error) {
            const criticalCount = criticalRes.value.count !== null ? criticalRes.value.count : 0;
            if (elCritical) elCritical.textContent = String(criticalCount);
        }

    } catch (err) {
        console.warn('Could not populate landing stats:', err);
    }
});
