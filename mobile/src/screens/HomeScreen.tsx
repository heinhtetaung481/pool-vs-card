import React, { useEffect, useState, useCallback } from 'react'
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    RefreshControl,
    ScrollView,
    Alert,
} from 'react-native'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { useActiveGames } from '../hooks/useActiveGames'
import { GameRoom, GamePlayer } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation'

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>
}

export default function HomeScreen({ navigation }: Props) {
    const { user, signOut } = useAuth()
    const [activeGames, setActiveGames] = useState<GameRoom[]>([])
    const [gameHistory, setGameHistory] = useState<any[]>([])
    const [playerRecords, setPlayerRecords] = useState<any[]>([])
    const [refreshing, setRefreshing] = useState(false)

    const realtimeGames = useActiveGames(activeGames)

    const loadData = async () => {
        try {
            const data = await api.game.getActive()
            setActiveGames(data.activeGames || [])
            setGameHistory(data.gameHistory || [])
            setPlayerRecords(data.playerRecords || [])
        } catch (e) {
            console.error('Failed to load games:', e)
        }
    }

    useFocusEffect(
        useCallback(() => {
            loadData()
        }, [])
    )

    const onRefresh = async () => {
        setRefreshing(true)
        await loadData()
        setRefreshing(false)
    }

    const handleJoin = async (gameId: string) => {
        try {
            await api.game.join(gameId)
            navigation.navigate('Game', { gameId })
        } catch (e: any) {
            Alert.alert('Error', e.message)
        }
    }

    const initial = (user?.user_metadata?.full_name || user?.email || 'U')[0].toUpperCase()

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Card Pool</Text>
                <Text style={styles.subtitle}>Real-time multiplayer pool with a twist</Text>
            </View>

            <View style={styles.profileCard}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>
                        {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Player'}
                    </Text>
                    <Text style={styles.profileStatus}>Authenticated</Text>
                </View>
                <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.createButton}
                onPress={() => navigation.navigate('NewGame')}
            >
                <Text style={styles.createButtonText}>+ Create New Game</Text>
            </TouchableOpacity>

            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.liveDot} />
                    <Text style={styles.sectionTitle}>Active Games</Text>
                </View>

                {realtimeGames.length > 0 ? (
                    realtimeGames.map((game) => (
                        <View key={game.id} style={styles.gameCard}>
                            <View style={styles.gameInfo}>
                                <Text style={styles.gameMeta}>
                                    {game.settings?.num_players || '?'} Players | ${game.settings?.joker_price || '?'} Joker
                                </Text>
                                <Text style={styles.gameId}>Room {game.id.slice(0, 6)}...</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.joinButton}
                                onPress={() => handleJoin(game.id)}
                            >
                                <Text style={styles.joinButtonText}>Join</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No games waiting. Create one!</Text>
                    </View>
                )}
            </View>

            {gameHistory.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Game History</Text>
                    {gameHistory.map((game: any) => {
                        const record = playerRecords.find((p: any) => p.game_id === game.id)
                        const score = record?.score || 0
                        return (
                            <View key={game.id} style={styles.gameCard}>
                                <View style={styles.gameInfo}>
                                    <Text style={styles.gameMeta}>
                                        {game.settings?.num_players || '?'} Players | {new Date(game.created_at).toLocaleDateString()}
                                    </Text>
                                    <Text style={styles.gameId}>Room {game.id.slice(0, 6)}...</Text>
                                </View>
                                <Text style={[styles.scoreText, score > 0 ? styles.scorePositive : score < 0 ? styles.scoreNegative : styles.scoreNeutral]}>
                                    {score > 0 ? '+' : ''}${score}
                                </Text>
                            </View>
                        )
                    })}
                </View>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        padding: 16,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 24,
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: '#10b981',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 4,
        fontWeight: '300',
    },
    profileCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 16,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#10b981',
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 'bold',
    },
    profileStatus: {
        color: '#10b981',
        fontSize: 12,
        marginTop: 2,
    },
    signOutButton: {
        padding: 8,
    },
    signOutText: {
        color: '#64748b',
        fontSize: 12,
    },
    createButton: {
        backgroundColor: '#10b981',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    sectionTitle: {
        color: '#e2e8f0',
        fontSize: 18,
        fontWeight: 'bold',
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
    },
    gameCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 8,
    },
    gameInfo: {
        flex: 1,
    },
    gameMeta: {
        color: '#94a3b8',
        fontSize: 12,
    },
    gameId: {
        color: '#cbd5e1',
        fontSize: 12,
        marginTop: 4,
    },
    joinButton: {
        backgroundColor: '#334155',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    joinButtonText: {
        color: '#e2e8f0',
        fontSize: 14,
        fontWeight: 'bold',
    },
    emptyCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    emptyText: {
        color: '#64748b',
        fontStyle: 'italic',
    },
    scoreText: {
        fontSize: 18,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    scorePositive: { color: '#10b981' },
    scoreNegative: { color: '#ef4444' },
    scoreNeutral: { color: '#64748b' },
})
