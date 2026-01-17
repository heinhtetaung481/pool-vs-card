"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

// Types
export type GameState = {
    room: any
    players: any[]
    myCards: any[]
    events: any[]
}

export function useGameRealtime(gameId: string, initialData: GameState, userId: string) {
    const [state, setState] = useState<GameState>(initialData)
    const router = useRouter()

    useEffect(() => {
        setState(initialData)
    }, [initialData])

    // Initialize Client-side Supabase for Realtime only (using Anon key is fine for listening if RLS allows)
    // We need to ensure we use the same user session if possible, but for public/shared channels standard client works.
    // Initialize Client-side Supabase for Realtime only
    // Use useMemo to prevent recreating client on every render which triggers effect
    const supabase = useState(() => createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ))[0]

    useEffect(() => {
        // Channel for all game updates
        const channel = supabase.channel(`game:${gameId}`)

        channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${gameId}` },
                (payload) => {
                    const newStatus = (payload.new as any).status
                    const prevStatus = state.room?.status
                    // Refresh page when game starts so each client fetches their cards
                    if (newStatus === 'playing' && prevStatus !== 'playing') {
                        router.refresh()
                    }
                    setState(prev => ({ ...prev, room: payload.new }))
                    if (newStatus === 'finished') {
                        // Maybe trigger confetti or modal?
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
                (payload) => {
                    // Update players list - Merge to preserve 'profiles' if present
                    setState(prev => {
                        const newPlayers = [...prev.players]
                        const idx = newPlayers.findIndex(p => p.id === (payload.new as any).id)

                        // If INSERT of new player, we rely on router.refresh() from useEffect to get profile eventually
                        // But for UPDATE of existing player (score, cards), we MUST preserve the profile data.
                        if (idx >= 0) {
                            newPlayers[idx] = {
                                ...newPlayers[idx], // Keep existing data (like profiles)
                                ...(payload.new as any) // Overwrite with new DB values
                            }
                        } else {
                            newPlayers.push(payload.new)
                        }
                        return { ...prev, players: newPlayers }
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'player_cards' },
                (payload) => {
                    setState(prev => {
                        // Find my player ID
                        const myPlayer = prev.players.find(p => p.user_id === userId)
                        if (!myPlayer) return prev

                        const eventType = payload.eventType
                        const newRecord = payload.new as any
                        const oldRecord = payload.old as any

                        if (eventType === 'INSERT') {
                            if (newRecord.player_id === myPlayer.id) {
                                return { ...prev, myCards: [...prev.myCards, newRecord] }
                            }
                        } else if (eventType === 'UPDATE') {
                            if (newRecord.player_id === myPlayer.id) {
                                return {
                                    ...prev,
                                    myCards: prev.myCards.map(c => c.id === newRecord.id ? newRecord : c)
                                }
                            }
                        } else if (eventType === 'DELETE') {
                            // Helper: Check if deleted card was mine (we only have oldRecord.id usually)
                            // But we can just filter it out if present
                            return {
                                ...prev,
                                myCards: prev.myCards.filter(c => c.id !== oldRecord.id)
                            }
                        }
                        return prev
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${gameId}` },
                (payload) => {
                    setState(prev => ({ ...prev, events: [payload.new, ...prev.events] }))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [gameId])

    return state
}
