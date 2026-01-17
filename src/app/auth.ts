
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { supabaseAdmin } from "@/lib/supabase" // Use admin to verify/signup? Or just public client?
// We should use a public client for login usually, but admin is fine server-side if careful.
// Actually, to use 'signInWithPassword', we need a client.
import { createClient } from "@supabase/supabase-js"

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        Credentials({
            name: "Supabase",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            authorize: async (credentials) => {
                const email = credentials.email as string
                const password = credentials.password as string

                if (!email || !password) return null

                // Use a fresh client to sign in (handles auth state correctly per request)
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                )

                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                })

                if (error) {
                    console.error("Supabase Auth Error:", error.message)
                    return null
                }

                if (data.user) {
                    // Ensure Profile Exists
                    const { data: profile } = await supabaseAdmin
                        .from("profiles")
                        .select("id")
                        .eq("id", data.user.id)
                        .single()

                    if (!profile) {
                        await supabaseAdmin.from("profiles").insert({
                            id: data.user.id,
                            username: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || "Player",
                            updated_at: new Date().toISOString()
                        })
                    }

                    return {
                        id: data.user.id,
                        email: data.user.email,
                        name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
                        image: data.user.user_metadata?.avatar_url
                    }
                }
                return null
            }
        })
    ],
    session: {
        strategy: "jwt"
    },
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.sub = user.id
                // token.email = user.email // already there
            }
            return token
        },
        session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub
            }
            return session
        },
    },
})
