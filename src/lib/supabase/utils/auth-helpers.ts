import { createClient } from '../client'

// Fast Auth Helper (0ms) to prevent slow network hanging
export async function getAuthTokenFast(silent: boolean = false) {
    if (typeof window === 'undefined') return null;
    const { useAuthStore } = await import('../../store');
    const authState = useAuthStore.getState();

    if (!authState.isAuthenticated || !authState.user) {
        if (silent) return null;
        throw new Error('Not authenticated: Please sign in to continue');
    }

    // 1. Try to read the native Supabase auth token directly from localStorage (0ms)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            try {
                const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
                if (sessionData && sessionData.access_token) {
                    return sessionData.access_token;
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
    }

    // 2. Try the custom token backup
    const customToken = localStorage.getItem('supabase_session_token');
    if (customToken) return customToken;

    // 3. Absolute fallback: ask Supabase (might hang, so we timeout at 100ms)
    const supabase = createClient();
    const getSessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));

    try {
        const { data } = await Promise.race([getSessionPromise, timeoutPromise]) as any;
        return data?.session?.access_token || null;
    } catch (e) {
        return null;
    }
}

// Fast User Helper (0ms) to prevent slow network hanging
export async function getUserFast() {
    if (typeof window === 'undefined') return null;
    const { useAuthStore } = await import('../../store');
    return useAuthStore.getState().user;
}
