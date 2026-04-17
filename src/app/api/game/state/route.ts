import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(req: NextRequest) {
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

    const gameId = req.nextUrl.searchParams.get("gameId")
    if (!gameId) {
        return NextResponse.json({ error: "Game ID required" }, { status: 400 })
    }

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    const { data: players } = await supabaseAdmin.from("game_players").select("*, profiles(username, avatar_url)").eq("game_id", gameId)

    const myPlayer = players?.find(p => p.user_id === user.id)

    const { data: myCards } = myPlayer
        ? await supabaseAdmin.from("player_cards").select("*").eq("player_id", myPlayer.id)
        : { data: [] }

    const { data: events } = await supabaseAdmin
        .from("game_events")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(50)

    return NextResponse.json({
        room,
        players: players || [],
        myCards: myCards || [],
        events: events || [],
        userId: user.id
    })
}
