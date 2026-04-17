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

    const { data: activeGames } = await supabaseAdmin
        .from("game_rooms")
        .select("*")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(10)

    const { data: playerRecords } = await supabaseAdmin
        .from("game_players")
        .select("game_id, score")
        .eq("user_id", user.id)

    const gameIds = playerRecords?.map(p => p.game_id) || []

    let closedGames: any[] = []
    if (gameIds.length > 0) {
        const { data } = await supabaseAdmin
            .from("game_rooms")
            .select("*")
            .in("id", gameIds)
            .eq("status", "closed")
            .order("created_at", { ascending: false })
            .limit(5)
        closedGames = data || []
    }

    return NextResponse.json({
        activeGames: activeGames || [],
        gameHistory: closedGames,
        playerRecords: playerRecords || []
    })
}
