import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { setAuthToken } from './api'
import { User, Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

type AuthContextType = {
    user: User | null
    session: Session | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<void>
    signUp: (email: string, password: string, username: string) => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.access_token) {
                setAuthToken(session.access_token)
            }
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.access_token) {
                setAuthToken(session.access_token)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const signIn = async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (data.session?.access_token) {
            setAuthToken(data.session.access_token)
        }
    }

    const signUp = async (email: string, password: string, username: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: username }
            }
        })
        if (error) throw error
        if (data.session?.access_token) {
            setAuthToken(data.session.access_token)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        setAuthToken(null)
        await AsyncStorage.removeItem('authToken')
    }

    return (
        <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}
