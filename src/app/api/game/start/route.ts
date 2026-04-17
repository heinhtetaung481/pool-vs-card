import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

function getShuffledDeck() {
    const deck: number[] = []
    for (let i = 1; i <= 52; i++) deck.push(i)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
}

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
    if (room.created_by !== user.id) return NextResponse.json({ error: "Only creator can start game" }, { status: 403 })

    const { data: players } = await supabaseAdmin.from("game_players").select("*").eq("game_id", gameId)
    if (!players || players.length === 0) return NextResponse.json({ error: "No players" }, { status: 400 })

    const playerIds = players.map(p => p.id)
    if (playerIds.length > 0) {
        await supabaseAdmin.from("player_cards").delete().in("player_id", playerIds)
    }

    const settings = room.settings as { num_players: number; cards_per_hand: number; joker_price: number; end_game_price: number }
    const deck = getShuffledDeck()
    const cardsPerHand = settings.cards_per_hand

    let turnOrder = room.turn_order as string[]
    const playerUserIds = players.map(p => p.user_id)
    const isValidOrder = turnOrder &&
        turnOrder.length === playerUserIds.length &&
        turnOrder.every(id => playerUserIds.includes(id))

    if (!isValidOrder) {
        const shuffled = [...players].sort(() => Math.random() - 0.5)
        turnOrder = shuffled.map(p => p.user_id)
    }

    const firstPlayerId = turnOrder[0]
    const cardInserts: any[] = []

    for (const player of players) {
        const hand = []
        for (let k = 0; k < cardsPerHand; k++) {
            const cardVal = deck.pop()
            if (cardVal) hand.push(cardVal)
        }

        await supabaseAdmin.from("game_players")
            .update({ cards_remaining_count: hand.length, has_license: false })
            .eq("id", player.id)

        for (const val of hand) {
            cardInserts.push({
                player_id: player.id,
                card_value: val,
                is_down: false,
                is_revealed: false
            })
        }
    }

    const { error: cardError } = await supabaseAdmin.from("player_cards").insert(cardInserts)
    if (cardError) return NextResponse.json({ error: "Failed to deal cards" }, { status: 500 })

    await supabaseAdmin.from("game_rooms").update({
        status: 'playing',
        turn_order: turnOrder,
        current_turn: firstPlayerId,
        deck_state: deck
    }).eq("id", gameId)

    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "game_start",
        payload: { started_by: user.id, round: room.round_number || 1 }
    })

    return NextResponse.json({ success: true })
}
