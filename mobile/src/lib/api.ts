import { ENV } from './env'

let authToken: string | null = null

export function setAuthToken(token: string | null) {
    authToken = token
}

export function getAuthToken() {
    return authToken
}

async function request(endpoint: string, options: RequestInit = {}) {
    const url = `${ENV.API_BASE_URL}${endpoint}`
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    }

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
    }

    const res = await fetch(url, { ...options, headers })
    const data = await res.json()

    if (!res.ok) {
        throw new Error(data.error || 'Request failed')
    }

    return data
}

export const api = {
    auth: {
        login: (email: string, password: string) =>
            request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
        signup: (email: string, password: string, username: string) =>
            request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, username }) }),
    },
    game: {
        getActive: () => request('/api/game/active'),
        getState: (gameId: string) => request(`/api/game/state?gameId=${gameId}`),
        create: (settings: { num_players: number; cards_per_hand: number; joker_price: number; end_game_price: number }) =>
            request('/api/game/create', { method: 'POST', body: JSON.stringify(settings) }),
        join: (gameId: string) =>
            request('/api/game/join', { method: 'POST', body: JSON.stringify({ gameId }) }),
        start: (gameId: string) =>
            request('/api/game/start', { method: 'POST', body: JSON.stringify({ gameId }) }),
        markBall: (gameId: string, ballNumber: number) =>
            request('/api/game/ball', { method: 'POST', body: JSON.stringify({ gameId, ballNumber }) }),
        passTurn: (gameId: string) =>
            request('/api/game/pass', { method: 'POST', body: JSON.stringify({ gameId }) }),
        resetRound: (gameId: string) =>
            request('/api/game/reset-round', { method: 'POST', body: JSON.stringify({ gameId }) }),
        closeRoom: (gameId: string) =>
            request('/api/game/close', { method: 'POST', body: JSON.stringify({ gameId }) }),
    },
}
