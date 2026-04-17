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

    const { gameId } = await req.json()
    if (!gameId) {
        return NextResponse.json({ error: "Game ID required" }, { status: 400 })
    }

    const { data: room, error: roomError } = await supabaseAdmin
        .from("game_rooms")
        .select("*")
        .eq("id", gameId)
        .single()

    if (roomError || !room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }
    if (room.status !== 'waiting') {
        return NextResponse.json({ error: "Game already started" }, { status: 400 })
    }

    const { count } = await supabaseAdmin
        .from("game_players")
        .select("*", { count: 'exact', head: true })
        .eq("game_id", gameId)

    const settings = room.settings as { num_players: number }
    if ((count || 0) >= settings.num_players) {
        return NextResponse.json({ error: "Room is full" }, { status: 400 })
    }

    const { error: joinError } = await supabaseAdmin
        .from("game_players")
        .insert({
            game_id: gameId,
            user_id: user.id,
            score: 0,
            cards_remaining_count: 0
        })

    if (joinError) {
        if (joinError.message.includes("unique")) {
            return NextResponse.json({ error: "Already joined" }, { status: 400 })
        }
        return NextResponse.json({ error: joinError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
