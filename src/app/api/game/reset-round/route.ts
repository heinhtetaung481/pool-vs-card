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
    if (room.created_by !== user.id) return NextResponse.json({ error: "Only creator can reset round" }, { status: 403 })

    const nextRound = (room.round_number || 1) + 1
    await supabaseAdmin.from("game_rooms").update({ round_number: nextRound }).eq("id", gameId)

    const startUrl = new URL(req.url)
    startUrl.pathname = "/api/game/start"

    const startRes = await fetch(startUrl.toString(), {
        method: "POST",
        headers: {
            "authorization": authHeader,
            "content-type": "application/json"
        },
        body: JSON.stringify({ gameId })
    })

    const startData = await startRes.json()
    return NextResponse.json(startData, { status: startRes.status })
}
