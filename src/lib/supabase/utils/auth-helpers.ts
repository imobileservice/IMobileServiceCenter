import { createClient } from '../client'

// Helper to check if a JWT token is expired
function isTokenExpired(token: string) {
    try {
        const payloadBase64Url = token.split('.')[1];
        if (!payloadBase64Url) return true;
        
        // Convert Base64Url to standard Base64
        let base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if necessary
        while (base64.length % 4) {
            base64 += '=';
        }
        
        // Decode base64
        const payloadJson = typeof window !== 'undefined' 
            ? window.atob(base64)
            : Buffer.from(base64, 'base64').toString();
            
        const payload = JSON.parse(payloadJson);
        const now = Math.floor(Date.now() / 1000);
        
        // If it expires in less than 60 seconds, treat it as expired
        return payload.exp < now + 60;
    } catch (e) {
        console.warn('[auth-helpers] Failed to decode token:', e);
        return true;
    }
}

// Fast Auth Helper (0ms-2s) to prevent slow network hanging but ensure valid sessions
export async function getAuthTokenFast(silent: boolean = false) {
    if (typeof window === 'undefined') return null;
    const { useAuthStore } = await import('../../store');
    const authState = useAuthStore.getState();

    if (!authState.isAuthenticated || !authState.user) {
        if (silent) return null;
        throw new Error('Not authenticated: Please sign in to continue');
    }

    // 1. Check custom token backup first (often more reliable in our app)
    const customToken = localStorage.getItem('supabase_session_token');
    if (customToken && !isTokenExpired(customToken)) {
        return customToken;
    }

    // 2. Try to read the native Supabase auth token from localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            try {
                const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
                if (sessionData && sessionData.access_token && !isTokenExpired(sessionData.access_token)) {
                    return sessionData.access_token;
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
    }

    // 3. Absolute fallback: ask Supabase (refreshing token if needed)
    // We increase timeout to 2000ms because 100ms is too short for a network-based refresh
    const supabase = createClient();
    const getSessionPromise = supabase.auth.getSession();
    const timeoutMsg = 'Token refresh timeout';
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), 2000));

    try {
        console.log('[getAuthTokenFast] 🔄 Attempting session refresh/retrieval (2s timeout)...');
        const { data } = await Promise.race([getSessionPromise, timeoutPromise]) as any;
        const freshToken = data?.session?.access_token || null;
        
        if (freshToken) {
            console.log('[getAuthTokenFast] ✅ Retrieved fresh token');
            // Store it back for next time
            localStorage.setItem('supabase_session_token', freshToken);
        }
        
        return freshToken;
    } catch (e: any) {
        console.warn('[getAuthTokenFast] ⚠️ Fallback session retrieval failed/timed out:', e.message);
        // If we have an expired token but better than nothing? 
        // No, backend will reject anyway.
        return null;
    }
}

// Fast User Helper (0ms) to prevent slow network hanging
export async function getUserFast() {
    if (typeof window === 'undefined') return null;
    const { useAuthStore } = await import('../../store');
    return useAuthStore.getState().user;
}
