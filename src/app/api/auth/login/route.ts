import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabase"

export async function POST(req: NextRequest) {
    const { email, password } = await req.json()

    if (!email || !password) {
        return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (data.user) {
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("id", data.user.id)
            .single()

        if (!profile) {
            await supabaseAdmin.from("profiles").insert({
                id: data.user.id,
                username: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || "Player",
                updated_at: new Date().toISOString()
            })
        }

        return NextResponse.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
                image: data.user.user_metadata?.avatar_url
            },
            session: data.session
        })
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
}
