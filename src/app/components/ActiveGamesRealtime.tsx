"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Users, DollarSign } from "lucide-react"
import { joinGame } from "@/app/actions/game"
import { useRouter } from "next/navigation"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type GameRoom = {
    id: string
    created_at: string
    status: string
    settings: {
        num_players: number
        cards_per_hand: number
        joker_price: number
        end_game_price: number
    }
}

export function ActiveGamesRealtime({
    initialGames,
    isAuthenticated
}: {
    initialGames: GameRoom[],
    isAuthenticated: boolean
}) {
    const [games, setGames] = useState<GameRoom[]>(initialGames)
    const [loading, setLoading] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        // Sync with initial data if it changes
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
                        // New room created - add to list
                        setGames(prev => [newRecord, ...prev])
                    } else if (eventType === 'UPDATE') {
                        // Room updated - check if status changed
                        if (newRecord.status === 'playing' || newRecord.status === 'closed') {
                            // Remove from waiting list
                            setGames(prev => prev.filter(g => g.id !== newRecord.id))
                        } else if (newRecord.status === 'waiting') {
                            // Update in list
                            setGames(prev => prev.map(g => g.id === newRecord.id ? newRecord : g))
                        }
                    } else if (eventType === 'DELETE') {
                        // Room deleted - remove from list
                        setGames(prev => prev.filter(g => g.id !== oldRecord.id))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const handleJoin = async (gameId: string) => {
        setLoading(gameId)
        try {
            await joinGame(gameId)
            router.push(`/game/${gameId}`)
        } catch (e) {
            console.error(e)
            setLoading(null)
        }
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Active Games
            </h2>
            <div className="space-y-3">
                {games.length > 0 ? (
                    games.map((game) => (
                        <div key={game.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex justify-between items-center hover:border-emerald-500/30 transition">
                            <div>
                                <div className="flex gap-3 text-xs text-slate-400 mb-1">
                                    <span className="flex items-center gap-1"><Users size={12} /> {game.settings?.num_players || '?'} Players</span>
                                    <span className="flex items-center gap-1"><DollarSign size={12} /> ${game.settings?.joker_price || '?'} Joker</span>
                                </div>
                                <p className="text-slate-300 text-xs">Room {game.id.slice(0, 6)}...</p>
                            </div>
                            <button
                                onClick={() => handleJoin(game.id)}
                                disabled={!isAuthenticated || loading === game.id}
                                className="px-4 py-2 bg-slate-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading === game.id ? "Joining..." : "Join"}
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="text-slate-500 italic p-4 border border-slate-800 rounded-xl text-center">
                        No games waiting. Create one!
                    </div>
                )}
            </div>
        </div>
    )
}
