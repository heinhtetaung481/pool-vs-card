
import { auth, signIn, signOut } from "@/app/auth"
import { redirect } from "next/navigation"
import { supabaseAdmin } from "@/lib/supabase"
import { Users, DollarSign, Play, Clock, History } from "lucide-react"
import { ActiveGamesRealtime } from "@/app/components/ActiveGamesRealtime"

// Types
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
    // We could join profiles to get creator name, but for MVP keep simple
}

// Game History Component (Server Component)
async function GameHistory({ userId }: { userId?: string }) {
    if (!userId) return null

    // Fetch closed games where user was a player
    const { data: playerRecords } = await supabaseAdmin
        .from("game_players")
        .select("game_id, score")
        .eq("user_id", userId)

    if (!playerRecords || playerRecords.length === 0) return null

    const gameIds = playerRecords.map(p => p.game_id)

    const { data: closedGames } = await supabaseAdmin
        .from("game_rooms")
        .select("*")
        .in("id", gameIds)
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(5)

    if (!closedGames || closedGames.length === 0) return null

    return (
        <div className="w-full mt-8">
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-4">
                <History size={20} className="text-slate-400" />
                Game History
            </h2>
            <div className="space-y-3">
                {closedGames.map((game: any) => {
                    const playerRecord = playerRecords.find(p => p.game_id === game.id)
                    const score = playerRecord?.score || 0
                    return (
                        <div key={game.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex justify-between items-center">
                            <div>
                                <div className="flex gap-3 text-xs text-slate-400 mb-1">
                                    <span className="flex items-center gap-1"><Users size={12} /> {game.settings?.num_players || '?'} Players</span>
                                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(game.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-slate-300 text-xs">Room {game.id.slice(0, 6)}...</p>
                            </div>
                            <div className="text-right">
                                <p className={`text-lg font-bold font-mono ${score > 0 ? "text-emerald-400" : score < 0 ? "text-red-400" : "text-slate-500"}`}>
                                    {score > 0 ? "+" : ""}${score}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase">Final Score</p>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default async function Home() {
    const session = await auth()

    // Fetch active waiting games
    const { data: activeGames } = await supabaseAdmin
        .from("game_rooms")
        .select("*")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(10)

    // Fetch players for these games to show count
    // Ideally this would be a join or view, but for MVP we can do it client side or just show "Waiting"
    // Let's rely on settings.num_players for capacity


    return (
        <div className="flex min-h-screen flex-col items-center bg-slate-950 text-white p-4">
            <div className="max-w-4xl w-full text-center mt-10">
                <h1 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-2">Card Pool</h1>
                <p className="text-slate-400 mb-8 font-light text-lg">
                    Real-time multiplayer pool with a twist.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    {/* Left Column: Auth / Create */}
                    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 p-6 rounded-2xl h-fit">
                        {session ? (
                            <div className="space-y-6">
                                <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
                                    {session.user?.image ? (
                                        <img src={session.user.image} alt="Avatar" className="w-12 h-12 rounded-full border-2 border-emerald-500" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full border-2 border-emerald-500 flex items-center justify-center bg-slate-800 text-lg font-bold">
                                            {(session.user?.name || "U")[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-bold text-white text-lg">{session.user?.name || "Player"}</p>
                                        <p className="text-xs text-emerald-400">Authenticated</p>
                                    </div>
                                </div>

                                <form action={async () => {
                                    "use server"
                                    const { redirect } = await import("next/navigation")
                                    redirect("/game/new")
                                }}>
                                    <button className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg flex items-center justify-center gap-2">
                                        <Play size={20} fill="currentColor" /> Create New Game
                                    </button>
                                </form>

                                <form action={async () => { "use server"; await signOut() }}>
                                    <button className="w-full text-sm text-slate-500 hover:text-white py-2">Sign Out</button>
                                </form>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h2 className="text-xl font-bold text-white">Sign In</h2>
                                <form action={async (formData) => {
                                    "use server"
                                    try { await signIn("credentials", formData) }
                                    catch (err) { if ((err as Error).message.includes("NEXT_REDIRECT")) throw err }
                                }} className="space-y-3">
                                    <input name="email" type="email" placeholder="Email" required className="w-full bg-slate-800 border-slate-700 rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-500" />
                                    <input name="password" type="password" placeholder="Password" required className="w-full bg-slate-800 border-slate-700 rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-500" />
                                    <button className="w-full bg-white text-slate-900 font-bold py-3 rounded-lg hover:bg-slate-200 transition">Sign In</button>
                                </form>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Active Games (Realtime) - Only for authenticated users */}
                    {session && (
                        <ActiveGamesRealtime
                            initialGames={activeGames || []}
                            isAuthenticated={!!session}
                        />
                    )}
                </div>

                {/* Game History Section */}
                {session && (
                    <GameHistory userId={session.user?.id} />
                )}
            </div>
        </div>
    )
}
