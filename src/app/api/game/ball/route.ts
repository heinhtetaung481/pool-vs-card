import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

type GameSettings = {
    num_players: number
    cards_per_hand: number
    joker_price: number
    end_game_price: number
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

    const { gameId, ballNumber } = await req.json()
    if (!gameId || !ballNumber) {
        return NextResponse.json({ error: "Game ID and ball number required" }, { status: 400 })
    }

    const shooterId = user.id

    const { data: gamePlayers } = await supabaseAdmin
        .from("game_players")
        .select("id, user_id, has_license, score, cards_remaining_count")
        .eq("game_id", gameId)

    if (!gamePlayers) return NextResponse.json({ error: "Game not found" }, { status: 404 })

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    if (room.current_turn !== shooterId) {
        return NextResponse.json({ error: "It is not your turn!" }, { status: 403 })
    }

    const shooterPlayer = gamePlayers.find((p: any) => p.user_id === shooterId)
    if (!shooterPlayer) return NextResponse.json({ error: "Shooter not in game" }, { status: 403 })

    const settings = room.settings as GameSettings

    if (ballNumber === 14 || ballNumber === 15) {
        const price = settings.joker_price
        for (const p of gamePlayers) {
            if (p.id === shooterPlayer.id) {
                const earned = (gamePlayers.length - 1) * price
                await supabaseAdmin.from("game_players").update({ score: p.score + earned }).eq("id", p.id)
            } else {
                await supabaseAdmin.from("game_players").update({ score: p.score - price }).eq("id", p.id)
            }
        }

        await supabaseAdmin.from("game_events").insert({
            game_id: gameId,
            event_type: "joker_scored",
            payload: { ball: ballNumber, shooter: shooterId, amount: price }
        })

        return NextResponse.json({ success: true, type: "joker" })
    }

    const playerIds = gamePlayers.map(p => p.id)
    const { data: allActiveCards } = await supabaseAdmin
        .from("player_cards")
        .select("id, player_id, card_value, is_down")
        .in("player_id", playerIds)
        .eq("is_down", false)

    const matchingCards = allActiveCards?.filter((c: any) => {
        const rank = (c.card_value - 1) % 13 + 1
        return rank === ballNumber
    }) || []

    const isHit = matchingCards.length > 0

    if (isHit) {
        const cardIds = matchingCards.map((c: any) => c.id)
        await supabaseAdmin.from("player_cards").update({ is_down: true, is_revealed: true }).in("id", cardIds)

        const affectedPlayerIds = [...new Set(matchingCards.map((c: any) => c.player_id))]
        for (const pid of affectedPlayerIds) {
            const { count } = await supabaseAdmin
                .from("player_cards")
                .select("*", { count: 'exact', head: true })
                .eq("player_id", pid)
                .eq("is_down", false)
            await supabaseAdmin.from("game_players").update({ cards_remaining_count: count || 0 }).eq("id", pid)
        }

        const shooterJustHitOwnCard = matchingCards.some((c: any) => c.player_id === shooterPlayer.id)
        if (shooterJustHitOwnCard) {
            if (!shooterPlayer.has_license) {
                await supabaseAdmin.from("game_players").update({ has_license: true }).eq("id", shooterPlayer.id)
                shooterPlayer.has_license = true
            }
        }

        const { count: shooterRemainingCount } = await supabaseAdmin
            .from("player_cards")
            .select("*", { count: 'exact', head: true })
            .eq("player_id", shooterPlayer.id)
            .eq("is_down", false)

        if (shooterRemainingCount === 0 && shooterPlayer.has_license) {
            const winPrice = settings.end_game_price
            for (const p of gamePlayers) {
                if (p.id === shooterPlayer.id) {
                    const earned = (gamePlayers.length - 1) * winPrice
                    await supabaseAdmin.from("game_players").update({ score: p.score + earned }).eq("id", p.id)
                } else {
                    await supabaseAdmin.from("game_players").update({ score: p.score - winPrice }).eq("id", p.id)
                }
            }

            await supabaseAdmin.from("game_rooms").update({ status: 'finished' }).eq("id", gameId)
            await supabaseAdmin.from("game_events").insert({
                game_id: gameId,
                event_type: "game_end",
                payload: { winner: shooterId }
            })

            return NextResponse.json({ success: true, type: "win", winner: shooterId })
        }

        await supabaseAdmin.from("game_events").insert({
            game_id: gameId,
            event_type: "ball_sunk",
            payload: { ball: ballNumber, shooter: shooterId, matches: matchingCards.length }
        })

        return NextResponse.json({ success: true, type: "normal" })
    }

    const { data: roomData } = await supabaseAdmin.from("game_rooms").select("deck_state").eq("id", gameId).single()
    let deck = (roomData?.deck_state as number[]) || []
    let drawnCard = null

    const order = room.turn_order as string[]
    const currentIndex = order.indexOf(room.current_turn)
    const nextIndex = (currentIndex + 1) % order.length
    const nextPlayerId = order[nextIndex]

    if (deck.length > 0) {
        drawnCard = deck.pop()
        const drawnCardRank = (drawnCard! - 1) % 13 + 1
        const { data: sunkEvents } = await supabaseAdmin
            .from("game_events")
            .select("id")
            .eq("game_id", gameId)
            .eq("event_type", "ball_sunk")
            .filter("payload->ball", "eq", drawnCardRank)
            .limit(1)

        const isBallAlreadySunk = sunkEvents && sunkEvents.length > 0

        await supabaseAdmin.from("player_cards").insert({
            player_id: shooterPlayer.id,
            card_value: drawnCard,
            is_down: isBallAlreadySunk,
            is_revealed: isBallAlreadySunk
        })

        await supabaseAdmin.from("game_rooms").update({
            deck_state: deck,
            current_turn: nextPlayerId
        }).eq("id", gameId)

        await supabaseAdmin.from("game_players").update({
            cards_remaining_count: (shooterPlayer.cards_remaining_count || 0) + 1
        }).eq("id", shooterPlayer.id)
    } else {
        await supabaseAdmin.from("game_rooms").update({ current_turn: nextPlayerId }).eq("id", gameId)
    }

    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "ball_sunk",
        payload: { ball: ballNumber, shooter: shooterId, matches: 0, foul: true }
    })

    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "foul",
        payload: {
            player: shooterId,
            ball: ballNumber,
            drawn_card: drawnCard,
            reason: "Sunk wrong ball - Drew card"
        }
    })

    return NextResponse.json({ success: false, type: "miss_turn", drawn: drawnCard })
}
