
import { auth } from "@/app/auth"
import { redirect } from "next/navigation"

export default async function NewGamePage() {
    const session = await auth()
    if (!session) redirect("/")

    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-xl">
                <h1 className="text-2xl font-bold text-emerald-400 mb-6 text-center">Create New Game</h1>

                <form action={async (formData) => {
                    "use server"

                    const settings = {
                        num_players: Number(formData.get("num_players")),
                        cards_per_hand: Number(formData.get("cards_per_hand")),
                        joker_price: Number(formData.get("joker_price")),
                        end_game_price: Number(formData.get("end_game_price")),
                    }

                    const { createGame } = await import("@/app/actions/game")
                    const gameId = await createGame(settings)

                    const { redirect } = await import("next/navigation")
                    redirect(`/game/${gameId}`)
                }} className="space-y-6">

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Number of Players</label>
                        <select name="num_players" defaultValue="2" className="w-full bg-slate-800 border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                            {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Players</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Cards Per Hand</label>
                        <input type="number" name="cards_per_hand" defaultValue="5" min="3" max="13" className="w-full bg-slate-800 border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        <p className="text-xs text-slate-500 mt-1">Between 3 and 13</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Joker Price ($)</label>
                            <input type="number" name="joker_price" defaultValue="1.50" min="0" step="0.01" className="w-full bg-slate-800 border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Win Bonus ($)</label>
                            <input type="number" name="end_game_price" defaultValue="5.00" min="0" step="0.01" className="w-full bg-slate-800 border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition transform hover:scale-[1.02]">
                            Create Game Room
                        </button>
                    </div>

                </form>
            </div>
        </div>
    )
}
