import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GameRoom } from '../types'

export function useActiveGames(initialGames: GameRoom[]) {
    const [games, setGames] = useState<GameRoom[]>(initialGames)

    useEffect(() => {
        setGames(initialGames)
    }, [initialGames])

    useEffect(() => {
        const channel = supabase.channel('dashboard-rooms')

        channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'game_rooms' },
                (payload) => {
                    const eventType = payload.eventType
                    const newRecord = payload.new as GameRoom
                    const oldRecord = payload.old as { id: string }

                    if (eventType === 'INSERT' && newRecord.status === 'waiting') {
                        setGames(prev => [newRecord, ...prev])
                    } else if (eventType === 'UPDATE') {
                        if (newRecord.status === 'playing' || newRecord.status === 'closed') {
                            setGames(prev => prev.filter(g => g.id !== newRecord.id))
                        } else if (newRecord.status === 'waiting') {
                            setGames(prev => prev.map(g => g.id === newRecord.id ? newRecord : g))
                        }
                    } else if (eventType === 'DELETE') {
                        setGames(prev => prev.filter(g => g.id !== oldRecord.id))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    return games
}
