import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/lib/auth'
import Navigation from './src/navigation'

export default function App() {
    return (
        <AuthProvider>
            <Navigation />
            <StatusBar style="light" />
        </AuthProvider>
    )
}
