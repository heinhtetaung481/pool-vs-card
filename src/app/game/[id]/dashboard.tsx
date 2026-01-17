"use client"

import { useState, useEffect } from "react"
import { useGameRealtime, GameState } from "@/app/hooks/useGameRealtime"
import { markBallDown, startGame, endGame, passTurn, resetRound, closeRoom } from "@/app/actions/game"
import { useRouter } from "next/navigation"
import {
    Trophy,
    Users,
    Clock,
    CheckCircle2,
    Play,
    DollarSign,
    Settings
} from "lucide-react"

// --- Inline UI Components ---
const UiCard = ({ children, className }: { children: React.ReactNode, className?: string }) =>
    <div className={`bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl ${className || ''}`}>{children}</div>

const UiButton = ({ onClick, children, disabled, variant = 'primary', className }: { onClick: () => void, children: React.ReactNode, disabled?: boolean, variant?: 'primary' | 'secondary', className?: string }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
            px-5 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2
            disabled:opacity-50 disabled:cursor-not-allowed shadow-md
            ${variant === 'primary'
                    ? "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white hover:-translate-y-0.5 shadow-emerald-500/20"
                    : "bg-slate-700 hover:bg-slate-600 text-white"
                }
            ${className || ''}
        `}
        >
            {disabled ? <span className="opacity-0 relative">{children}</span> : children}
            {disabled && <Clock size={16} className="animate-spin absolute" />}
        </button>
    )
}

// -------------------------------------------------------------------

export default function GameDashboard({
    gameId,
    initialData,
    userId
}: {
    gameId: string,
    initialData: GameState,
    userId: string
}) {
    const { room, players, myCards, events } = useGameRealtime(gameId, initialData, userId)
    const [loading, setLoading] = useState(false)
    const [showClosedStats, setShowClosedStats] = useState(false) // State for showing closed room stats modal
    const router = useRouter() // Ensure router is available

    // EFFECT: Lock body scroll when any modal is open
    useEffect(() => {
        const isModalOpen = showClosedStats || room.status === 'finished' || room.status === 'closed'
        if (isModalOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [showClosedStats, room.status])

    // EFFECT: Hard refresh when round changes to ensure cards are fetched
    useEffect(() => {
        router.refresh()
    }, [room.round_number, router])

    // Determine Winner for Next Round control
    const gameEndEvents = events.filter((e: any) => e.event_type === 'game_end')
    // Sort desc by created_at to find latest
    const latestGameEnd = gameEndEvents.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    const winnerId = latestGameEnd?.payload?.winner
    const isWinner = winnerId === userId

    // Handler for Close Room

    // Handler for Close Room
    const handleCloseRoom = async () => {
        setConfirmModal({
            isOpen: true,
            title: "Close Room",
            message: "Are you sure you want to close this room? This will end the game permanently and show final stats.",
            onConfirm: async () => {
                setConfirmModal(null)
                setLoading(true)
                try {
                    await closeRoom(gameId)
                    setLoading(false)
                    setShowClosedStats(true) // Show stats modal instead of redirect
                } catch (e: any) {
                    setAlertModal({ isOpen: true, title: "Error", message: e.message })
                    setLoading(false)
                }
            }
        })
    }

    const myPlayer = players.find((p: any) => p.user_id === userId)
    const opponents = players.filter((p: any) => p.user_id !== userId)
    const isCreator = room.created_by === userId
    const settings = room.settings || {}

    const isMyTurn = room.current_turn === userId

    // Modal State
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null)
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean, title: string, message: string } | null>(null)

    const handleMarkBall = async (ball: number) => {
        if (loading || room.status !== 'playing' || !isMyTurn) return
        setLoading(true)
        try {
            const res = await markBallDown(gameId, ball, userId)
            if (res && res.type === 'miss_turn') {
                setAlertModal({
                    isOpen: true,
                    title: "Missed!",
                    message: "You didn't hit any of your cards. Turn passed to next player."
                })
            }
        } catch (e: any) {
            setAlertModal({ isOpen: true, title: "Error", message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handlePassTurn = async () => {
        if (loading || !isMyTurn) return
        setLoading(true)
        try {
            await passTurn(gameId)
        } catch (e: any) {
            setAlertModal({ isOpen: true, title: "Error", message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handleStartGame = async () => {
        setLoading(true)
        try {
            await startGame(gameId)
        } catch (e: any) {
            setAlertModal({ isOpen: true, title: "Error", message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handleResetRound = async () => {
        setConfirmModal({
            isOpen: true,
            title: "Start Next Round?",
            message: "This will clear all cards and deal new hands to all players.",
            onConfirm: async () => {
                setLoading(true)
                try {
                    await resetRound(gameId)
                } catch (e: any) {
                    setAlertModal({ isOpen: true, title: "Error", message: e.message })
                } finally {
                    setLoading(false)
                    setConfirmModal(null)
                }
            }
        })
    }

    const sunkBalls = new Set<number>()
    events.forEach((e: any) => {
        // Exclude Jokers (14 and 15) so they remain active on table
        if (e.event_type === 'ball_sunk' && e.payload.ball < 14) {
            sunkBalls.add(e.payload.ball)
        }
    })

    // Pool Ball Styles
    // Use radial gradients to look 3D
    const getBallStyle = (num: number) => {
        const isStripe = num > 8 && num < 16
        const colors: Record<number, string> = {
            1: "#eab308", 9: "#eab308", // Yellow
            2: "#2563eb", 10: "#2563eb", // Blue
            3: "#dc2626", 11: "#dc2626", // Red
            4: "#7c3aed", 12: "#7c3aed", // Purple
            5: "#f97316", 13: "#f97316", // Orange
            6: "#16a34a", 14: "#16a34a", // Green
            7: "#78350f", 15: "#78350f", // Maroon -> Brownish
            8: "#1e293b", // Black
        }

        const baseColor = colors[num] || "#333"

        if (isStripe) {
            return {
                background: `linear-gradient(90deg, #fff 25%, ${baseColor} 25%, ${baseColor} 75%, #fff 75%)`,
                color: "#1e293b" // dark text on stripes
            }
        }
        return {
            background: `radial-gradient(circle at 30% 30%, #fff 5%, ${baseColor} 30%, ${baseColor} 100%)`,
            color: "#fff"
        }
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 p-4 font-sans relative">

            {/* Close Room Icon (Top Right - Fixed) */}
            {isCreator && (
                <div className="fixed top-4 right-4 z-[200]">
                    <button
                        onClick={handleCloseRoom}
                        disabled={loading}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-900/90 hover:bg-red-500 text-slate-400 hover:text-white transition-all border border-slate-700/50 hover:border-red-500 shadow-2xl backdrop-blur-md"
                        title="Close Room"
                    >
                        <span className="sr-only">Close Room</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>
            )}

            {/* Header / Stats Bar */}
            <div className="max-w-7xl mx-auto mb-8 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap justify-between items-center backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        CARD POOL
                    </h1>
                    <div className="h-8 w-[1px] bg-slate-700 mx-2 hidden md:block"></div>
                    <div className="flex gap-4 text-xs font-mono text-slate-400">
                        <span className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded"><Settings size={12} /> {settings.num_players}P / {settings.cards_per_hand}C</span>
                        <span className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded"><DollarSign size={12} /> Joker: ${settings.joker_price}</span>
                        <span className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded"><DollarSign size={12} /> Win: ${settings.end_game_price}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 mt-4 md:mt-0">
                    {/* Turn Indicator (Mobile/Desktop) */}
                    {room.status === 'playing' && (
                        <div className={`px-2 py-1 md:px-4 md:py-1.5 rounded-lg border flex items-center gap-2 shadow-lg transition-all ${isMyTurn ? "bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                            {isMyTurn ? (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    <span className="text-[10px] md:text-xs font-black tracking-widest uppercase">YOUR TURN</span>
                                </>
                            ) : (
                                <>
                                    <Clock size={12} className={isMyTurn ? "text-amber-500" : "text-slate-500"} />
                                    <span className="text-[10px] md:text-xs font-bold tracking-wider uppercase">
                                        Waiting for {(() => {
                                            if (room.current_turn === userId) return "You"
                                            const p = players.find((p: any) => p.user_id === room.current_turn)
                                            return p?.profiles?.username || `Player ${room.current_turn?.slice(0, 4)}`
                                        })()}
                                    </span>
                                </>
                            )}
                        </div>
                    )}

                    <span className={`px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider ${room.status === 'playing' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'}`}>
                        {room.status === 'playing' ? `Round ${room.round_number || 1}` : room.status}
                    </span>

                    {room.status === 'waiting' && isCreator && (
                        <UiButton onClick={handleStartGame} disabled={loading || players.length < 2} className="shadow-emerald-500/20 shadow-lg">
                            <Play size={16} /> Start Game
                        </UiButton>
                    )}

                    {/* Controls for Active Player */}
                    {room.status === 'playing' && isMyTurn && (
                        <UiButton onClick={handlePassTurn} disabled={loading} className="bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white border border-amber-400/30 shadow-[0_0_15px_rgba(245,158,11,0.3)] h-8 md:h-10 text-xs md:text-sm">
                            Pass Turn <Play size={12} className="ml-1" />
                        </UiButton>
                    )}


                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT: Game Table (Balls) */}
                <div className="lg:col-span-8 flex flex-col gap-6">

                    {/* Mobile Only: Brief Opponents */}
                    <div className="block lg:hidden overflow-x-auto pb-2 -mb-2">
                        <div className="flex gap-3">
                            {opponents.map((opp: any) => {
                                const isTheirTurn = room.current_turn === opp.user_id
                                const jokerCount = events.filter((e: any) => e.event_type === 'joker_scored' && e.payload.shooter === opp.user_id).length
                                return (
                                    <div key={opp.id} className={`flex-shrink-0 flex items-center gap-3 p-2 rounded-lg border min-w-[160px] ${isTheirTurn ? "bg-amber-900/20 border-amber-500/50" : "bg-slate-800/50 border-slate-700/50"}`}>
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white relative flex-shrink-0 overflow-hidden">
                                            {opp.profiles?.avatar_url ? (
                                                <img src={opp.profiles.avatar_url} alt="Av" className="w-full h-full object-cover" />
                                            ) : (
                                                opp.profiles?.username?.substring(0, 2).toUpperCase() || opp.user_id.slice(0, 2)
                                            )}
                                            {isTheirTurn && <div className="absolute inset-0 rounded-full border-2 border-amber-500 animate-pulse"></div>}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`text-[10px] font-bold ${isTheirTurn ? "text-amber-400" : "text-slate-300"} truncate max-w-[100px]`}>
                                                {opp.profiles?.username || `Player ${opp.user_id.slice(0, 4)}`}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-emerald-400 font-mono font-bold">${opp.score}</span>
                                                <div className="w-[1px] h-3 bg-slate-700"></div>
                                                <span className="text-[10px] text-slate-400 flex items-center" title="Cards Remaining">
                                                    <div className="w-2 h-3 bg-slate-500 rounded-sm mr-1"></div>
                                                    {opp.cards_remaining_count}
                                                </span>
                                                <div className="w-[1px] h-3 bg-slate-700"></div>
                                                <span className="text-[10px] text-purple-400 flex items-center" title="Jokers">
                                                    <span className="font-bold mr-0.5">J</span>
                                                    {jokerCount}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    {/* Realistic Pool Table Container */}
                    <div className="relative w-full aspect-[2/1] md:aspect-[2.2/1] bg-[#1a1a1a] rounded-xl shadow-2xl border-8 border-[#2d2d2d] flex items-center justify-center p-4 md:p-8 lg:p-10 select-none overflow-hidden">

                        {/* Table Frame/Rails (Visual) */}
                        <div className="absolute inset-0 bg-[#2d2d2d] z-0"></div>

                        {/* Playing Surface (Felt) */}
                        <div className="absolute inset-3 md:inset-5 rounded-lg bg-[#0e2b58] shadow-[inset_0_0_50px_rgba(0,0,0,0.7)] z-0 border border-blue-900/30 overflow-hidden">
                            {/* Felt Texture */}
                            <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/felt.png')] mix-blend-overlay pointer-events-none"></div>

                            {/* Gradient Overlay for lighting */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/40 pointer-events-none"></div>
                        </div>

                        {/* Pockets (SVG for precise positioning) */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <radialGradient id="pocket-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                    <stop offset="0%" stopColor="#000" stopOpacity="1" />
                                    <stop offset="90%" stopColor="#1a1a1a" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#333" stopOpacity="1" />
                                </radialGradient>
                                <filter id="shadow">
                                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.5" />
                                </filter>
                            </defs>

                            {/* Pockets */}
                            <circle cx="2%" cy="5%" r="3.5%" fill="url(#pocket-gradient)" />
                            <circle cx="50%" cy="3%" r="3.5%" fill="url(#pocket-gradient)" />
                            <circle cx="98%" cy="5%" r="3.5%" fill="url(#pocket-gradient)" />

                            <circle cx="2%" cy="95%" r="3.5%" fill="url(#pocket-gradient)" />
                            <circle cx="50%" cy="97%" r="3.5%" fill="url(#pocket-gradient)" />
                            <circle cx="98%" cy="95%" r="3.5%" fill="url(#pocket-gradient)" />
                        </svg>

                        {/* Balls Grid - Centered on felt */}
                        <div className="relative z-20 grid grid-cols-5 gap-3 md:gap-6 lg:gap-8 w-full max-w-2xl mx-auto items-center justify-items-center">
                            {Array.from({ length: 15 }, (_, i) => i + 1).map((num: number) => {
                                const isSunk = sunkBalls.has(num)
                                const style = getBallStyle(num)

                                return (
                                    <button
                                        key={num}
                                        onClick={() => handleMarkBall(num)}
                                        disabled={loading || room.status !== 'playing' || isSunk || !isMyTurn}
                                        style={!isSunk ? style : undefined}
                                        className={`
                                            w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center font-black text-sm md:text-xl shadow-[2px_4px_6px_rgba(0,0,0,0.4)] transform transition-all duration-300
                                            ${isSunk
                                                ? "bg-[#0a1525] border border-blue-900/30 text-[#1e3a8a] shadow-none scale-90 cursor-not-allowed grayscale-[0.8] opacity-60"
                                                : (!isMyTurn || loading || room.status !== 'playing')
                                                    ? "opacity-50 cursor-not-allowed grayscale-[0.5]"
                                                    : "hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] active:scale-95 cursor-pointer ring-1 ring-white/10"
                                            }
                                        `}
                                    >
                                        <span className={`drop-shadow-sm ${(num > 8 && num < 16 && !isSunk) ? "bg-white/90 px-1.5 py-0.5 rounded-[2px] leading-none" : ""}`}>
                                            {num}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* MY HAND & JOKER STATS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Hand Section - Takes up 2 columns */}
                        <div className="md:col-span-2">
                            <UiCard className="p-6 bg-gradient-to-br from-slate-900 to-slate-900/50 h-full">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Trophy className="text-yellow-500" size={20} />
                                            My Hand
                                            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                                                {myCards.filter((c: any) => c.is_down).length} / {myCards.length} Sunk
                                            </span>
                                        </h2>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">License:</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${myPlayer?.has_license ? "bg-emerald-500 text-slate-900 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-slate-700 text-slate-400"}`}>
                                                {myPlayer?.has_license ? "ACTIVE" : "PENDING"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Score</p>
                                        <p className="text-3xl font-black text-emerald-400 drop-shadow-lg">${myPlayer?.score || 0}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                                    {myCards.length > 0 ? myCards.sort((a: any, b: any) => a.card_value - b.card_value).map((card: any) => (
                                        <div
                                            key={card.id}
                                            className={`
                                            w-16 h-24 rounded-xl flex flex-col items-center justify-center border-2 transition-all duration-300 relative select-none
                                            ${card.is_down
                                                    ? "bg-slate-300 border-slate-400 text-slate-400 grayscale-0 opacity-90 shadow-inner z-0"
                                                    : "bg-white text-slate-900 border-slate-200 shadow-xl hover:-translate-y-2 hover:shadow-emerald-500/30 hover:border-emerald-400 z-10"
                                                }
                                        `}
                                        >
                                            <span className={`text-2xl font-bold ${["♥", "♦"].includes(["♠", "♥", "♦", "♣"][Math.floor((card.card_value - 1) / 13)]) ? "text-red-600" : "text-slate-900"}`}>
                                                {["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][(card.card_value - 1) % 13]}
                                            </span>
                                            <span className={`text-lg absolute bottom-2 ${["♥", "♦"].includes(["♠", "♥", "♦", "♣"][Math.floor((card.card_value - 1) / 13)]) ? "text-red-500" : "text-slate-400"}`}>
                                                {["♠", "♥", "♦", "♣"][Math.floor((card.card_value - 1) / 13)]}
                                            </span>
                                            {card.is_down && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <div className="w-14 h-14 rounded-full border-4 border-slate-600/70 flex items-center justify-center transform -rotate-12 bg-slate-600/10 backdrop-blur-[1px] opacity-60">
                                                        <span className="text-slate-600/80 font-black text-[10px] tracking-widest opacity-60">SUNK</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )) : (
                                        <p className="text-slate-500 text-sm italic w-full text-center py-4">Waiting for game start...</p>
                                    )}
                                </div>
                            </UiCard>
                        </div>

                        {/* Joker Stats Section */}
                        <div className="md:col-span-1">
                            <UiCard className="p-5 bg-gradient-to-br from-purple-900/40 to-slate-900/80 h-full border-purple-500/20 flex flex-col relative overflow-hidden">
                                {/* Decorative BG */}
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-600/20 blur-3xl rounded-full pointer-events-none"></div>

                                {(() => {
                                    const jokerEvents = events.filter((e: any) => e.event_type === 'joker_scored')

                                    // Calculate Stats
                                    let myTotalNet = 0

                                    // Map of Player ID -> Stats
                                    const statsMap: Record<string, { jokers: number, netVsMe: number }> = {}

                                    // Initialize for all players (including me)
                                    players.forEach((p: any) => {
                                        statsMap[p.user_id] = { jokers: 0, netVsMe: 0 }
                                    })

                                    jokerEvents.forEach((e: any) => {
                                        const shooterId = e.payload.shooter
                                        const price = e.payload.amount || settings.joker_price || 0

                                        // Increment Joker Count
                                        if (statsMap[shooterId]) {
                                            statsMap[shooterId].jokers += 1
                                        }

                                        // Financials (Net vs Me)
                                        if (shooterId === userId) {
                                            // I won: Everyone owes me 'price'
                                            // My total net increases by (N-1)*price, but here we track specific debts
                                            opponents.forEach((opp: any) => {
                                                if (statsMap[opp.user_id]) {
                                                    statsMap[opp.user_id].netVsMe += price
                                                }
                                            })
                                            myTotalNet += (players.length - 1) * price
                                        } else {
                                            // Someone else won
                                            if (statsMap[shooterId]) {
                                                // I owe 'shooter' price
                                                statsMap[shooterId].netVsMe -= price
                                            }
                                            // I lose price
                                            myTotalNet -= price
                                        }
                                    })

                                    return (
                                        <div className="flex flex-col h-full z-10">
                                            {/* Header */}
                                            <div className="flex justify-between items-start mb-4">
                                                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-purple-500/30">J</span>
                                                    Joker Report
                                                </h2>
                                            </div>

                                            {/* List */}
                                            <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                                {/* Me Row */}
                                                <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-emerald-600/80 flex items-center justify-center text-xs font-bold text-white border border-emerald-400/30">
                                                            ME
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-white">Me</p>
                                                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                                <div className="w-3 h-3 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/50 text-purple-300 text-[8px] font-bold">J</div>
                                                                <span>{statsMap[userId]?.jokers || 0} Found</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex flex-col items-end">
                                                        <span className="text-[10px] text-slate-400 uppercase font-bold">Total Net</span>
                                                        <span className={`text-sm font-black ${myTotalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                            {myTotalNet >= 0 ? "+" : ""}${myTotalNet}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Opponents Rows */}
                                                {opponents.map((opp: any) => {
                                                    const stats = statsMap[opp.user_id]
                                                    const balance = stats?.netVsMe || 0
                                                    const isOwed = balance > 0 // Opponent owes me
                                                    const isDebt = balance < 0 // I owe opponent

                                                    return (
                                                        <div key={opp.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                                                    {opp.profiles?.username?.substring(0, 2).toUpperCase() || opp.user_id.slice(0, 2)}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-300">{opp.profiles?.username || `Player ${opp.user_id.slice(0, 4)}`}</p>
                                                                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                                                        <div className="w-3 h-3 rounded-full bg-purple-900/40 flex items-center justify-center border border-purple-500/20 text-purple-400 text-[8px] font-bold">J</div>
                                                                        <span>{stats?.jokers || 0} Found</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right flex flex-col items-end">
                                                                {balance !== 0 ? (
                                                                    <>
                                                                        <span className={`text-[10px] font-black uppercase tracking-wide ${isOwed ? "text-emerald-400" : "text-red-400"}`}>
                                                                            {isOwed ? "OWES ME" : "I OWE"}
                                                                        </span>
                                                                        <span className={`text-xs font-mono font-bold ${isOwed ? "text-emerald-300" : "text-red-300"}`}>
                                                                            ${Math.abs(balance)}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-600 font-bold uppercase">Even</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                                {opponents.length === 0 && <p className="text-xs text-slate-500 text-center py-2">No other players.</p>}
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-purple-500/10 text-[10px] text-center text-slate-500">
                                                Joker Value: <span className="text-slate-300">${settings.joker_price}</span> / hit
                                            </div>
                                        </div>
                                    )
                                })()}
                            </UiCard>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Sidebar */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Opponents (Hidden on Mobile, shown in brief view above) */}
                    <div className="hidden lg:block">
                        <UiCard className="p-5">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Opponents</h3>
                            <div className="space-y-3">
                                {opponents.map((opp: any) => {
                                    const jokerCount = events.filter((e: any) => e.event_type === 'joker_scored' && e.payload.shooter === opp.user_id).length
                                    const isTheirTurn = room.current_turn === opp.user_id

                                    return (
                                        <div key={opp.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isTheirTurn ? "bg-amber-900/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : "bg-slate-800/50 border-slate-700/50"}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg overflow-hidden">
                                                        {opp.profiles?.avatar_url ? (
                                                            <img src={opp.profiles.avatar_url} alt="Av" className="w-full h-full object-cover" />
                                                        ) : (
                                                            opp.profiles?.username?.substring(0, 2).toUpperCase() || opp.user_id.slice(0, 2)
                                                        )}
                                                    </div>
                                                    {isTheirTurn && (
                                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-slate-900 animate-bounce">
                                                            <Clock size={8} className="text-black" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold ${isTheirTurn ? "text-amber-400" : "text-white"}`}>
                                                        {opp.profiles?.username || `Player ${opp.user_id.slice(0, 4)}`}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${opp.has_license ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-700 text-slate-500 border border-slate-600"}`}>
                                                            {opp.has_license ? "LICENSED" : "NO LICENSE"}
                                                        </span>
                                                        <span className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-2 ml-1">${opp.score}</span>
                                                        <div className="flex items-center gap-0.5 ml-1 border-l border-slate-700 pl-2">
                                                            <span className="w-3 h-3 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center text-[8px] font-bold">J</span>
                                                            <span className="text-xs text-purple-300 font-bold">{jokerCount}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-center bg-slate-900 rounded p-2 min-w-[50px] flex flex-col items-center gap-1">
                                                <p className="text-[10px] text-slate-500 uppercase">Cards</p>
                                                <p className="text-xl font-black text-white leading-none">{opp.cards_remaining_count}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                                {opponents.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No opponents joined yet.</p>}
                            </div>
                        </UiCard>
                    </div>

                    {/* Activity Feed */}
                    <UiCard className="p-5 flex-1 flex flex-col h-[500px]">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Activity Feed</h3>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {events.map((event: any, i: number) => {
                                let icon = <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5" />
                                if (event.event_type === 'ball_sunk') icon = <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 ring-2 ring-blue-500/20" />
                                if (event.event_type === 'joker_scored') icon = <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 ring-2 ring-purple-500/20" />
                                if (event.event_type === 'game_end') icon = <Trophy size={14} className="text-yellow-500" />

                                return (
                                    <div key={event.id || i} className="flex gap-3 text-xs p-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition">
                                        {icon}
                                        <div>
                                            <div className="text-slate-300">
                                                {event.event_type === 'game_start' && <span className="text-emerald-400 font-bold">Game Started! Good luck.</span>}
                                                {event.event_type === 'ball_sunk' && (() => {
                                                    const shooter = players.find((p: any) => p.user_id === event.payload.shooter)
                                                    const name = shooter ? (shooter.user_id === userId ? "You" : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : "Unknown"
                                                    return (
                                                        <span>
                                                            <strong className="text-emerald-400">{name}</strong> sunk Ball <strong className="text-white">{event.payload.ball}</strong>.
                                                            {event.payload.matches > 0 ? <span className="text-amber-400 ml-1">({event.payload.matches} cards flipped!)</span> : <span className="text-slate-500 ml-1">(No matches)</span>}
                                                        </span>
                                                    )
                                                })()}
                                                {event.event_type === 'foul' && (() => {
                                                    const shooter = players.find((p: any) => p.user_id === event.payload.player)
                                                    const name = shooter ? (shooter.user_id === userId ? "You" : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : "Unknown"
                                                    return (
                                                        <span className="text-red-400">
                                                            <strong className="text-white">{name}</strong> fouled on Ball <strong>{event.payload.ball}</strong>.
                                                            {event.payload.drawn_card ? <span className="text-amber-400 ml-1"> Drew a penalty card!</span> : <span className="text-slate-500 ml-1"> (Deck empty)</span>}
                                                        </span>
                                                    )
                                                })()}
                                                {event.event_type === 'joker_scored' && (() => {
                                                    const shooter = players.find((p: any) => p.user_id === event.payload.shooter)
                                                    const name = shooter ? (shooter.user_id === userId ? "You" : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : "Unknown"
                                                    return (
                                                        <span className="text-purple-300">
                                                            <strong>JOKER!</strong> <strong className="text-white">{name}</strong> sunk Ball {event.payload.ball}. Cash transfer!
                                                        </span>
                                                    )
                                                })()}
                                                {event.event_type === 'game_end' && <span className="text-yellow-400 font-bold">GAME OVER! Winner: {event.payload.winner === userId ? "You!" : (() => { const p = players.find((p: any) => p.user_id === event.payload.winner); return p?.profiles?.username || event.payload.winner.slice(0, 8) + "..."; })()}</span>}
                                            </div>
                                            <span className="text-[10px] text-slate-600 block mt-1">
                                                {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </UiCard>
                </div>
            </div>
            {/* GAME END STATS MODAL */}
            {
                room.status === 'finished' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">

                            {/* Modal Header */}
                            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 uppercase italic tracking-wider flex items-center gap-3">
                                        <Trophy size={32} className="text-yellow-500" />
                                        Game Over
                                    </h2>
                                    <p className="text-slate-400 text-sm mt-1">Round {room.round_number || 1} Complete</p>
                                </div>
                                {/* Winner Display */}
                                {(() => {
                                    const endEvent = events.find((e: any) => e.event_type === 'game_end')
                                    const winnerId = endEvent?.payload?.winner
                                    const winner = players.find((p: any) => p.user_id === winnerId)
                                    if (winner) {
                                        return (
                                            <div className="text-right">
                                                <p className="text-xs text-slate-500 uppercase font-bold">Winner</p>
                                                <p className="text-xl font-bold text-emerald-400">
                                                    {winner.user_id === userId ? "YOU WON!" : `Player ${winner.user_id.slice(0, 4)}`}
                                                </p>
                                            </div>
                                        )
                                    }
                                    return null
                                })()}
                            </div>

                            {/* Stats Table */}
                            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                            <th className="py-3 font-bold">Player</th>
                                            <th className="py-3 font-bold text-center">Score</th>
                                            <th className="py-3 font-bold text-center">Jokers</th>
                                            <th className="py-3 font-bold text-right">Net Result</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {players.map((p: any) => {
                                            // Calc Joker Count
                                            const jokerCount = events.filter((e: any) => e.event_type === 'joker_scored' && e.payload.shooter === p.user_id).length

                                            // Calculate Net vs ME (from my perspective) 
                                            // But for general table we want "Net Change this Game" or just Total Score? 
                                            // The prompt says "user's net financial position against each opponent". 
                                            // For the main table, let's show Total Score as the main metric.

                                            const isMe = p.user_id === userId
                                            const isWinner = events.find((e: any) => e.event_type === 'game_end')?.payload?.winner === p.user_id

                                            return (
                                                <tr key={p.id} className={`border-b border-slate-800/50 ${isMe ? "bg-slate-800/30" : ""}`}>
                                                    <td className="py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ${isWinner ? "bg-yellow-500" : "bg-slate-700"}`}>
                                                                {isWinner ? <Trophy size={14} className="text-slate-900" /> : p.user_id.slice(0, 2)}
                                                            </div>
                                                            <div>
                                                                <p className={`font-bold ${isMe ? "text-emerald-400" : "text-slate-300"}`}>
                                                                    {isMe ? "You" : `Player ${p.user_id.slice(0, 4)}`}
                                                                </p>
                                                                {isWinner && <span className="text-[10px] text-yellow-500 font-black uppercase">Winner</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-center font-bold font-mono text-slate-300">
                                                        ${p.score}
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <span className="inline-flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded text-purple-400 text-xs font-bold">
                                                            {jokerCount} <span className="text-[10px] opacity-70">J</span>
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-right">
                                                        {/* Total Net Logic is complex to back-calculate if we only store cumulative score. 
                                                         Assuming 'Score' IS the net financial result from $0 start. 
                                                         If `score` starts at 0, then it represents Net Profit/Loss.
                                                     */}
                                                        <span className={`font-bold font-mono ${p.score > 0 ? "text-emerald-400" : p.score < 0 ? "text-red-400" : "text-slate-500"}`}>
                                                            {p.score > 0 ? "+" : ""}${p.score}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-6 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-4">
                                {/* Only Winner can Start Next Round */}
                                {isWinner ? (
                                    <UiButton onClick={handleResetRound} disabled={loading} className="w-full sm:w-auto shadow-[0_0_20px_rgba(16,185,129,0.3)] bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black border-none transform hover:scale-105 transition-all">
                                        <Play size={18} fill="currentColor" /> START NEXT ROUND
                                    </UiButton>
                                ) : (
                                    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700">
                                        <Clock size={14} className="text-slate-500 animate-spin-slow" />
                                        <span className="text-slate-400 text-xs font-medium">
                                            {room.status === 'finished'
                                                ? `Waiting for Winner (${players.find((p: any) => p.user_id === winnerId)?.user_id?.slice(0, 4) || '...'}) to start next round...`
                                                : "Waiting..."}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ROOM CLOSED STATS MODAL */}
            {(room.status === 'closed' || showClosedStats) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500 uppercase italic tracking-wider flex items-center gap-3">
                                <CheckCircle2 size={32} className="text-red-500" />
                                Room Closed
                            </h2>
                            <div className="flex gap-4 mt-2">
                                <p className="text-slate-400 text-sm">
                                    <span className="text-white font-bold">{room.round_number || 1}</span> Rounds Played
                                </p>
                                <p className="text-slate-400 text-sm">
                                    Your Net: <span className={`font-bold font-mono ${myPlayer?.score > 0 ? "text-emerald-400" : myPlayer?.score < 0 ? "text-red-400" : "text-slate-400"}`}>
                                        {myPlayer?.score > 0 ? "+" : ""}${myPlayer?.score || 0}
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Stats Table */}
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Final Standings</h3>
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                        <th className="py-3 font-bold">Player</th>
                                        <th className="py-3 font-bold text-center">Net Result</th>
                                        <th className="py-3 font-bold text-center">Jokers</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {players.map((p: any) => {
                                        const jokerCount = events.filter((e: any) => e.event_type === 'joker_scored' && e.payload.shooter === p.user_id).length
                                        const isMe = p.user_id === userId
                                        const score = p.score || 0
                                        return (
                                            <tr key={p.id} className={`border-b border-slate-800/50 ${isMe ? "bg-slate-800/30" : ""}`}>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                                                            {p.profiles?.username?.substring(0, 2).toUpperCase() || p.user_id.slice(0, 2)}
                                                        </div>
                                                        <span className="font-medium text-white">
                                                            {p.profiles?.username || `Player ${p.user_id.slice(0, 4)}`}
                                                            {isMe && <span className="text-xs text-slate-500 ml-2">(You)</span>}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={`py-4 text-center font-mono font-bold ${score > 0 ? "text-emerald-400" : score < 0 ? "text-red-400" : "text-slate-400"}`}>
                                                    {score > 0 ? "+" : ""}{score}
                                                </td>
                                                <td className="py-4 text-center text-purple-400 font-bold">{jokerCount}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-slate-900/50 border-t border-slate-800 flex justify-center">
                            <UiButton onClick={() => router.push("/")} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400">
                                Return to Dashboard
                            </UiButton>
                        </div>
                    </div>
                </div>
            )}

            {/* ALERT MODAL */}
            {
                alertModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <UiCard className="w-full max-w-sm bg-slate-900 border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <span className={alertModal.title === "Error" ? "text-red-500" : "text-amber-500"}>
                                        {alertModal.title === "Error" ? "⚠️" : "ℹ️"}
                                    </span>
                                    {alertModal.title}
                                </h3>
                            </div>
                            <div className="p-6 text-slate-300 text-sm">
                                {alertModal.message}
                            </div>
                            <div className="p-4 bg-slate-950/30 flex justify-end">
                                <UiButton onClick={() => setAlertModal(null)} className="bg-slate-800 hover:bg-slate-700">
                                    Close
                                </UiButton>
                            </div>
                        </UiCard>
                    </div>
                )
            }

            {/* CONFIRM MODAL */}
            {
                confirmModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <UiCard className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    ❓ {confirmModal.title}
                                </h3>
                            </div>
                            <div className="p-6 text-slate-300 text-sm">
                                {confirmModal.message}
                            </div>
                            <div className="p-4 bg-slate-950/30 flex justify-end gap-3">
                                <UiButton onClick={() => setConfirmModal(null)} variant="secondary" className="bg-slate-800 hover:bg-slate-700">
                                    Cancel
                                </UiButton>
                                <UiButton
                                    onClick={confirmModal.onConfirm}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                    Confirm
                                </UiButton>
                            </div>
                        </UiCard>
                    </div>
                )
            }

        </div>
    )
}


