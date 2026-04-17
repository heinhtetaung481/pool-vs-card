import React, { useState } from 'react'
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ScrollView,
} from 'react-native'
import { useAuth } from '../lib/auth'

export default function LoginScreen() {
    const { signIn, signUp } = useAuth()
    const [isSignUp, setIsSignUp] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [username, setUsername] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Email and password are required')
            return
        }

        setLoading(true)
        try {
            if (isSignUp) {
                await signUp(email, password, username || email.split('@')[0])
                Alert.alert('Success', 'Account created! Check your email for verification.')
            } else {
                await signIn(email, password)
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Authentication failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Card Pool</Text>
                    <Text style={styles.subtitle}>Real-time multiplayer pool with a twist</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.formTitle}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>

                    {isSignUp && (
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#64748b"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    )}

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor="#64748b"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#64748b"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => setIsSignUp(!isSignUp)}
                    >
                        <Text style={styles.switchText}>
                            {isSignUp
                                ? 'Already have an account? Sign In'
                                : "Don't have an account? Sign Up"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 40,
        fontWeight: '900',
        color: '#10b981',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 16,
        color: '#64748b',
        marginTop: 8,
        fontWeight: '300',
    },
    form: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
    },
    formTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#e2e8f0',
        marginBottom: 20,
    },
    input: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 10,
        padding: 14,
        color: '#e2e8f0',
        fontSize: 16,
        marginBottom: 12,
    },
    button: {
        backgroundColor: '#10b981',
        borderRadius: 10,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    switchButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    switchText: {
        color: '#64748b',
        fontSize: 14,
    },
})
