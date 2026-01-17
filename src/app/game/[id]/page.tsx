import { auth } from "@/app/auth"
import { supabaseAdmin } from "@/lib/supabase"
import GameDashboard from "./dashboard"
import { notFound, redirect } from "next/navigation"

export default async function GamePage({ params }: { params: { id: string } }) {
    const session = await auth()
    if (!session) redirect("/")

    const { id } = await params // Await params in Next.js 15+ convention if needed, though this is 14/15 safe.

    // Fetch Initial State
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", id).single()
    if (!room) notFound()

    const { data: players } = await supabaseAdmin.from("game_players").select("*, profiles(username, avatar_url)").eq("game_id", id)

    // Find current user's player
    const myPlayer = players?.find(p => p.user_id === session.user?.id)

    const { data: myCards } = myPlayer
        ? await supabaseAdmin.from("player_cards").select("*").eq("player_id", myPlayer.id)
        : { data: [] }

    const { data: events } = await supabaseAdmin
        .from("game_events")
        .select("*")
        .eq("game_id", id)
        .order("created_at", { ascending: false })
        .limit(50)

    const initialData = {
        room,
        players: players || [],
        myCards: myCards || [],
        events: events || []
    }

    return (
        <GameDashboard
            gameId={id}
            initialData={initialData}
            userId={session.user.id}
        />
    )
}
