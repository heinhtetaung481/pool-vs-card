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

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })
    if (room.current_turn !== user.id) {
        return NextResponse.json({ error: "Not your turn" }, { status: 403 })
    }

    const order = room.turn_order as string[]
    const currentIndex = order.indexOf(room.current_turn)
    const nextIndex = (currentIndex + 1) % order.length
    const nextPlayerId = order[nextIndex]

    await supabaseAdmin.from("game_rooms").update({ current_turn: nextPlayerId }).eq("id", gameId)

    return NextResponse.json({ success: true })
}
