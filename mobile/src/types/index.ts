export type GameSettings = {
    num_players: number
    cards_per_hand: number
    joker_price: number
    end_game_price: number
}

export type GameRoom = {
    id: string
    created_at: string
    created_by: string
    status: 'waiting' | 'playing' | 'finished' | 'closed'
    settings: GameSettings
    current_turn: string | null
    turn_order: string[] | null
    deck_state: number[] | null
    round_number: number
}

export type Profile = {
    username: string | null
    avatar_url: string | null
}

export type GamePlayer = {
    id: string
    game_id: string
    user_id: string
    has_license: boolean
    cards_remaining_count: number
    score: number
    joined_at: string
    profiles?: Profile
}

export type PlayerCard = {
    id: string
    player_id: string
    card_value: number
    is_down: boolean
    is_revealed: boolean
}

export type GameEvent = {
    id: string
    game_id: string
    event_type: string
    payload: any
    created_at: string
}

export type User = {
    id: string
    email?: string
    name?: string
    image?: string
}

export type GameState = {
    room: GameRoom
    players: GamePlayer[]
    myCards: PlayerCard[]
    events: GameEvent[]
}
