import { createClient } from '@supabase/supabase-js'

// WARNING: access to this client must be restricted to server-side code only.
// It uses the SERVICE_ROLE_KEY to bypass RLS.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})
