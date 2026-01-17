"use server"

import { auth } from "@/app/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { revalidatePath } from "next/cache"

// Types
type GameSettings = {
    num_players: number
    cards_per_hand: number
    joker_price: number
    end_game_price: number
}

// Helper to shuffle cards (1-13)
function getShuffledDeck(excludeEvents: number[] = []) {
    // Standard 52 Card Deck
    // 1-13 Spades, 14-26 Hearts, 27-39 Diamonds, 40-52 Clubs
    const deck: number[] = []
    for (let i = 1; i <= 52; i++) {
        deck.push(i)
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
}

/**
 * Create a new Game Room
 */
export async function createGame(settings: GameSettings) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room, error } = await supabaseAdmin
        .from("game_rooms")
        .insert({
            created_by: session.user.id,
            settings: settings,
            status: 'waiting'
        })
        .select()
        .single()

    if (error) throw new Error(error.message)

    // Auto-join the creator
    await joinGame(room.id)

    return room.id
}

/**
 * Join an existing Game Room
 */
export async function joinGame(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    // Check if room is full or started
    const { data: room, error: roomError } = await supabaseAdmin
        .from("game_rooms")
        .select("*")
        .eq("id", gameId)
        .single()

    if (roomError || !room) throw new Error("Room not found")
    if (room.status !== 'waiting') throw new Error("Game already started")

    // Check current player count
    const { count } = await supabaseAdmin
        .from("game_players")
        .select("*", { count: 'exact', head: true })
        .eq("game_id", gameId)

    const settings = room.settings as GameSettings
    if ((count || 0) >= settings.num_players) {
        throw new Error("Room is full")
    }

    // Add player
    const { error: joinError } = await supabaseAdmin
        .from("game_players")
        .insert({
            game_id: gameId,
            user_id: session.user.id,
            score: 0,
            cards_remaining_count: 0 // Will be set when game starts
        })

    // If already in, ignore error (or handle gracefully)
    if (joinError && !joinError.message.includes("unique constrain")) {
        // In production, better error checking
    }

    revalidatePath(`/game/${gameId}`)
}

/**
 * Update Turn Order (Setup Phase)
 */
export async function updateTurnOrder(gameId: string, newOrder: string[]) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")
    if (room.created_by !== session.user.id) throw new Error("Only creator can change order")
    if (room.status !== 'waiting') throw new Error("Cannot change order after start")

    await supabaseAdmin.from("game_rooms").update({ turn_order: newOrder }).eq("id", gameId)
    revalidatePath(`/game/${gameId}`)
}

/**
 * Start Game (Deal Cards & Init Turns)
 * Also used for "Next Round"
 */
export async function startGame(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    // Get Room and Players
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")
    if (room.created_by !== session.user.id) throw new Error("Only creator can start game")

    const { data: players } = await supabaseAdmin.from("game_players").select("*").eq("game_id", gameId)
    if (!players || players.length === 0) throw new Error("No players")

    // Clean up previous round cards if any
    const playerIds = players.map(p => p.id)
    if (playerIds.length > 0) {
        await supabaseAdmin.from("player_cards").delete().in("player_id", playerIds)
    }

    const settings = room.settings as GameSettings
    const deck = getShuffledDeck()
    const cardsPerHand = settings.cards_per_hand

    // Init Turn Order
    let turnOrder = room.turn_order as string[]

    // Validate if turnOrder matches current players (in case someone joined after ordering)
    const playerUserIds = players.map(p => p.user_id)
    const isValidOrder = turnOrder &&
        turnOrder.length === playerUserIds.length &&
        turnOrder.every(id => playerUserIds.includes(id))

    if (!isValidOrder) {
        // Fallback: Randomize
        const shuffled = [...players].sort(() => Math.random() - 0.5)
        turnOrder = shuffled.map(p => p.user_id)
    }

    const firstPlayerId = turnOrder[0]

    // Deal cards logic
    const playerUpdates = []
    const cardInserts = []

    for (const player of players) {
        // Player gets N cards
        const hand = []
        for (let k = 0; k < cardsPerHand; k++) {
            const cardVal = deck.pop()
            if (cardVal) hand.push(cardVal)
        }

        playerUpdates.push({
            id: player.id,
            cards_remaining_count: hand.length,
            has_license: false // Reset license for new round
        })

        for (const val of hand) {
            cardInserts.push({
                player_id: player.id,
                card_value: val,
                is_down: false,
                is_revealed: false
            })
        }
    }

    // Transactional updates
    // 1. Insert cards
    const { error: cardError } = await supabaseAdmin.from("player_cards").insert(cardInserts)
    if (cardError) throw new Error("Failed to deal cards: " + cardError.message)

    // 2. Update players (counts & license reset)
    for (const p of playerUpdates) {
        await supabaseAdmin.from("game_players")
            .update({ cards_remaining_count: p.cards_remaining_count, has_license: false })
            .eq("id", p.id)
    }

    // 3. Update room status & turns & DECK STATE
    await supabaseAdmin.from("game_rooms").update({
        status: 'playing',
        turn_order: turnOrder,
        current_turn: firstPlayerId,
        deck_state: deck // Save remaining cards
    }).eq("id", gameId)

    // 4. Log event
    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "game_start",
        payload: { started_by: session.user.id, round: room.round_number || 1 }
    })

    revalidatePath(`/game/${gameId}`)
}

/**
 * Pass Turn
 */
export async function passTurn(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")

    // Validate it's their turn
    if (room.current_turn !== session.user.id) {
        throw new Error("Not your turn")
    }

    const order = room.turn_order as string[]
    const currentIndex = order.indexOf(room.current_turn)
    const nextIndex = (currentIndex + 1) % order.length
    const nextPlayerId = order[nextIndex]

    await supabaseAdmin.from("game_rooms").update({ current_turn: nextPlayerId }).eq("id", gameId)

    revalidatePath(`/game/${gameId}`)
}

/**
 * Reset Round (Next Round)
 */
export async function resetRound(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")
    if (room.created_by !== session.user.id) throw new Error("Only creator can reset round")

    // Increment Round Number
    const nextRound = (room.round_number || 1) + 1

    // Update Round Number first
    await supabaseAdmin.from("game_rooms").update({ round_number: nextRound }).eq("id", gameId)

    // Call Start Game (which cleans up and redeals)
    await startGame(gameId)
}



/**
 * End Game Manually
 */
export async function endGame(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")
    if (room.created_by !== session.user.id) throw new Error("Only creator can end game")

    await supabaseAdmin.from("game_rooms").update({ status: 'finished' }).eq("id", gameId)

    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "game_end",
        payload: { winner: "Manual End", manual: true }
    })

    revalidatePath(`/game/${gameId}`)
}

/**
 * Mark Ball Down - The Core Logic
 */
/**
 * Mark Ball Down - The Core Logic
 */
export async function markBallDown(gameId: string, ballNumber: number, shooterId: string) {
    // 1. Validate
    const { data: gamePlayers } = await supabaseAdmin
        .from("game_players")
        .select("id, user_id, has_license, score, cards_remaining_count")
        .eq("game_id", gameId)

    if (!gamePlayers) throw new Error("Game not found")

    // FIND ROOM to check turn
    const { data: room } = await supabaseAdmin.from("game_rooms").select("*").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")

    // STRICT TURN CHECK
    if (room.current_turn !== shooterId) {
        throw new Error("It is not your turn!")
    }

    // Find shooter's player record
    const shooterPlayer = gamePlayers.find((p: any) => p.user_id === shooterId)
    if (!shooterPlayer) throw new Error("Shooter not in game")

    const settings = room.settings as GameSettings

    // Handle Joker (14, 15)
    if (ballNumber === 14 || ballNumber === 15) {
        // Joker logic: trigger financial/score transfer
        // Transfer `joker_price` from all other players to shooter
        const price = settings.joker_price

        // Update scores
        for (const p of gamePlayers) {
            if (p.id === shooterPlayer.id) {
                // Shooter gets (N-1) * price
                const earned = (gamePlayers.length - 1) * price
                await supabaseAdmin.from("game_players").update({ score: p.score + earned }).eq("id", p.id)
            } else {
                // Others lose price
                await supabaseAdmin.from("game_players").update({ score: p.score - price }).eq("id", p.id)
            }
        }

        // Log Event
        await supabaseAdmin.from("game_events").insert({
            game_id: gameId,
            event_type: "joker_scored",
            payload: { ball: ballNumber, shooter: shooterId, amount: price }
        })

        return { success: true, type: "joker" }
    }

    // Handle Regular Balls (1-13)
    // 2. Query *all* active cards to filter in JS (since we need modulo math for 1-52 -> 1-13)
    const playerIds = gamePlayers.map(p => p.id)

    const { data: allActiveCards } = await supabaseAdmin
        .from("player_cards")
        .select("id, player_id, card_value, is_down")
        .in("player_id", playerIds)
        .eq("is_down", false)

    // Filter for matches: (card_value - 1) % 13 + 1 === ballNumber
    const matchingCards = allActiveCards?.filter((c: any) => {
        const rank = (c.card_value - 1) % 13 + 1
        return rank === ballNumber
    }) || []

    const isHit = matchingCards.length > 0

    // --- HIT LOGIC ---
    if (isHit) {
        // 3. Update those cards to is_down = true AND is_revealed = true
        const cardIds = matchingCards.map((c: any) => c.id)
        await supabaseAdmin
            .from("player_cards")
            .update({ is_down: true, is_revealed: true })
            .in("id", cardIds)

        // 4. Update cards_remaining_count for affected players
        const affectedPlayerIds = [...new Set(matchingCards.map((c: any) => c.player_id))]

        for (const pid of affectedPlayerIds) {
            // Decrement count
            const { count } = await supabaseAdmin
                .from("player_cards")
                .select("*", { count: 'exact', head: true })
                .eq("player_id", pid)
                .eq("is_down", false)

            await supabaseAdmin.from("game_players").update({ cards_remaining_count: count || 0 }).eq("id", pid)
        }

        // 5. Check if `shooterId` holds the card
        const shooterJustHitOwnCard = matchingCards.some((c: any) => c.player_id === shooterPlayer.id)

        if (shooterJustHitOwnCard) {
            // Grants License
            if (!shooterPlayer.has_license) {
                await supabaseAdmin.from("game_players").update({ has_license: true }).eq("id", shooterPlayer.id)
                shooterPlayer.has_license = true
            }
        }

        // 6. Check for Win Condition (Shooter cleared all cards + License)
        // Re-check count for shooter specifically
        const { count: shooterRemainingCount } = await supabaseAdmin
            .from("player_cards")
            .select("*", { count: 'exact', head: true })
            .eq("player_id", shooterPlayer.id)
            .eq("is_down", false)

        if (shooterRemainingCount === 0 && shooterPlayer.has_license) {
            // WINNER!
            // Financial Transfer: Everyone pays Winner 'end_game_price'
            const winPrice = settings.end_game_price
            for (const p of gamePlayers) {
                if (p.id === shooterPlayer.id) {
                    // Winner gets (N-1) * winPrice
                    const earned = (gamePlayers.length - 1) * winPrice
                    await supabaseAdmin.from("game_players").update({ score: p.score + earned }).eq("id", p.id)
                } else {
                    // Losers pay
                    await supabaseAdmin.from("game_players").update({ score: p.score - winPrice }).eq("id", p.id)
                }
            }

            await supabaseAdmin.from("game_rooms").update({ status: 'finished' }).eq("id", gameId)

            // Log Win
            await supabaseAdmin.from("game_events").insert({
                game_id: gameId,
                event_type: "game_end",
                payload: { winner: shooterId }
            })

            return { success: true, type: "win", winner: shooterId }
        }

        // Log Hit
        await supabaseAdmin.from("game_events").insert({
            game_id: gameId,
            event_type: "ball_sunk",
            payload: { ball: ballNumber, shooter: shooterId, matches: matchingCards.length }
        })

        return { success: true, type: "normal" }
    }

    // --- MISS / FOUL LOGIC ---
    // If no cards matched (and not Joker), foul & draw
    // 1. Get Room Deck State
    const { data: roomData } = await supabaseAdmin.from("game_rooms").select("deck_state").eq("id", gameId).single()
    let deck = (roomData?.deck_state as number[]) || []

    let drawnCard = null

    // Pass Turn Logic
    const order = room.turn_order as string[]
    const currentIndex = order.indexOf(room.current_turn)
    const nextIndex = (currentIndex + 1) % order.length
    const nextPlayerId = order[nextIndex]

    if (deck.length > 0) {
        drawnCard = deck.pop()

        // Check if the ball for this card's rank is already sunk
        const drawnCardRank = (drawnCard! - 1) % 13 + 1 // 1-13
        const { data: sunkEvents } = await supabaseAdmin
            .from("game_events")
            .select("id")
            .eq("game_id", gameId)
            .eq("event_type", "ball_sunk")
            .filter("payload->ball", "eq", drawnCardRank)
            .limit(1)

        const isBallAlreadySunk = sunkEvents && sunkEvents.length > 0

        // Insert drawn card (mark as sunk if ball already down)
        await supabaseAdmin.from("player_cards").insert({
            player_id: shooterPlayer.id,
            card_value: drawnCard,
            is_down: isBallAlreadySunk,
            is_revealed: isBallAlreadySunk
        })

        // Update Deck
        await supabaseAdmin.from("game_rooms").update({
            deck_state: deck,
            current_turn: nextPlayerId
        }).eq("id", gameId)

        // Update shooter card count in game_players to reflect draw
        await supabaseAdmin.from("game_players").update({
            cards_remaining_count: (shooterPlayer.cards_remaining_count || 0) + 1
        }).eq("id", shooterPlayer.id)

    } else {
        // Just pass turn if deck empty
        await supabaseAdmin.from("game_rooms").update({ current_turn: nextPlayerId }).eq("id", gameId)
    }

    // Log Ball Sunk (so ball is disabled on table)
    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "ball_sunk",
        payload: { ball: ballNumber, shooter: shooterId, matches: 0, foul: true }
    })

    // Log "Foul - Card Drawn"
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

    revalidatePath(`/game/${gameId}`)
    return { success: false, type: "foul", drawn: drawnCard }
}

/**
 * Close Room
 */
export async function closeRoom(gameId: string) {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    const { data: room } = await supabaseAdmin.from("game_rooms").select("created_by").eq("id", gameId).single()
    if (!room) throw new Error("Room not found")
    if (room.created_by !== session.user.id) throw new Error("Only creator can close the room")

    await supabaseAdmin.from("game_rooms").update({ status: 'closed' }).eq("id", gameId)

    // Log room closure event
    await supabaseAdmin.from("game_events").insert({
        game_id: gameId,
        event_type: "room_closed",
        payload: { closed_by: session.user.id }
    })

    revalidatePath(`/game/${gameId}`)
    // Client handles redirect
}
