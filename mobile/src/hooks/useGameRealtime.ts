import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { GameState, GamePlayer, PlayerCard, GameEvent } from '../types'

export function useGameRealtime(gameId: string, initialData: GameState, userId: string) {
    const [state, setState] = useState<GameState>(initialData)
    const channelRef = useRef<any>(null)

    useEffect(() => {
        setState(initialData)
    }, [initialData])

    useEffect(() => {
        if (!gameId) return

        const channel = supabase.channel(`game:${gameId}`)
        channelRef.current = channel

        channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${gameId}` },
                (payload) => {
                    setState(prev => ({ ...prev, room: payload.new as any }))
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
                (payload) => {
                    setState(prev => {
                        const newPlayers = [...prev.players]
                        const idx = newPlayers.findIndex(p => p.id === (payload.new as any).id)
                        if (idx >= 0) {
                            newPlayers[idx] = { ...newPlayers[idx], ...(payload.new as any) }
                        } else {
                            newPlayers.push(payload.new as any)
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
                    setState(prev => ({ ...prev, events: [payload.new as GameEvent, ...prev.events] }))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [gameId, userId])

    return state
}
