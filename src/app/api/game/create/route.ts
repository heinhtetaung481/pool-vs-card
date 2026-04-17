import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization")
    if (!authHeader) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const settings = {
        num_players: body.num_players || 2,
        cards_per_hand: body.cards_per_hand || 5,
        joker_price: body.joker_price || 1.5,
        end_game_price: body.end_game_price || 5,
    }

    const { data: room, error } = await supabaseAdmin
        .from("game_rooms")
        .insert({
            created_by: user.id,
            settings,
            status: 'waiting'
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabaseAdmin.from("game_players").insert({
        game_id: room.id,
        user_id: user.id,
        score: 0,
        cards_remaining_count: 0
    })

    return NextResponse.json({ gameId: room.id })
}
