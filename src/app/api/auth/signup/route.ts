import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabase"

export async function POST(req: NextRequest) {
    const { email, password, username } = await req.json()

    if (!email || !password) {
        return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: username || email.split('@')[0]
            }
        }
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
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
                username: username || email.split('@')[0],
                updated_at: new Date().toISOString()
            })
        }

        return NextResponse.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                name: username || email.split('@')[0]
            },
            session: data.session
        })
    }

    return NextResponse.json({ error: "Signup failed" }, { status: 400 })
}
