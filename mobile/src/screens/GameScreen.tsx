import React, { useEffect, useState, useCallback } from 'react'
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
} from 'react-native'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { useGameRealtime } from '../hooks/useGameRealtime'
import { GameState, GameRoom, GamePlayer, PlayerCard, GameEvent } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation'


type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>
    route: { params: { gameId: string } }
}

function getBallColor(num: number): string {
    const colors: Record<number, string> = {
        1: '#eab308', 9: '#eab308',
        2: '#2563eb', 10: '#2563eb',
        3: '#dc2626', 11: '#dc2626',
        4: '#7c3aed', 12: '#7c3aed',
        5: '#f97316', 13: '#f97316',
        6: '#16a34a', 14: '#16a34a',
        7: '#78350f', 15: '#78350f',
        8: '#1e293b',
    }
    return colors[num] || '#333'
}

function isStripe(num: number): boolean {
    return num > 8 && num < 16
}

function PoolBall({ num, isSunk, canClick, onPress }: { num: number; isSunk: boolean; canClick: boolean; onPress: () => void }) {
    const color = getBallColor(num)
    const stripe = isStripe(num)

    if (isSunk) {
        return (
            <TouchableOpacity disabled style={styles.ballSunk} onPress={onPress}>
                <Text style={styles.ballSunkText}>{num}</Text>
            </TouchableOpacity>
        )
    }

    return (
        <TouchableOpacity
            style={[
                styles.ball,
                !canClick && styles.ballDisabled,
                { backgroundColor: color },
            ]}
            onPress={onPress}
            disabled={!canClick}
            activeOpacity={0.7}
        >
            {stripe && <View style={styles.ballStripeBand} />}
            <View style={styles.ballCenterCircle}>
                <Text style={styles.ballCenterText}>{num}</Text>
            </View>
        </TouchableOpacity>
    )
}

function CardDisplay({ card }: { card: PlayerCard }) {
    const suits = ['♠', '♥', '♦', '♣']
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const rankIdx = (card.card_value - 1) % 13
    const suitIdx = Math.floor((card.card_value - 1) / 13)
    const suit = suits[suitIdx]
    const rank = ranks[rankIdx]
    const isRed = suit === '♥' || suit === '♦'

    return (
        <View style={[styles.card, card.is_down && styles.cardDown]}>
            <Text style={[styles.cardRank, isRed && styles.cardRed]}>{rank}</Text>
            <Text style={[styles.cardSuit, isRed && styles.cardRed]}>{suit}</Text>
            {card.is_down && (
                <View style={styles.sunkOverlay}>
                    <Text style={styles.sunkText}>SUNK</Text>
                </View>
            )}
        </View>
    )
}

export default function GameScreen({ navigation, route }: Props) {
    const { user } = useAuth()
    const { gameId } = route.params
    const [initialData, setInitialData] = useState<GameState | null>(null)
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
    const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null)
    const [activeTab, setActiveTab] = useState<'table' | 'feed'>('table')

    const loadGameState = async () => {
        try {
            const data = await api.game.getState(gameId)
            setInitialData(data)
        } catch (e: any) {
            Alert.alert('Error', e.message)
            navigation.goBack()
        }
    }

    useFocusEffect(
        useCallback(() => {
            loadGameState()
        }, [gameId])
    )

    if (!initialData || !user) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading game...</Text>
            </View>
        )
    }

    return (
        <GameContent
            gameId={gameId}
            initialData={initialData}
            userId={user.id}
            onRefresh={loadGameState}
            navigation={navigation}
        />
    )
}

function GameContent({
    gameId,
    initialData,
    userId,
    onRefresh,
    navigation,
}: {
    gameId: string
    initialData: GameState
    userId: string
    onRefresh: () => void
    navigation: any
}) {
    const { room, players, myCards, events } = useGameRealtime(gameId, initialData, userId)
    const [loading, setLoading] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
    const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null)
    const [activeTab, setActiveTab] = useState<'table' | 'feed'>('table')

    const myPlayer = players.find(p => p.user_id === userId)
    const opponents = players.filter(p => p.user_id !== userId)
    const isCreator = room.created_by === userId
    const isMyTurn = room.current_turn === userId
    const settings = room.settings || {}

    const sunkBalls = new Set<number>()
    events.forEach((e: GameEvent) => {
        if (e.event_type === 'ball_sunk' && e.payload.ball < 14) {
            sunkBalls.add(e.payload.ball)
        }
    })

    const gameEndEvents = events.filter(e => e.event_type === 'game_end')
    const latestGameEnd = gameEndEvents.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    const winnerId = latestGameEnd?.payload?.winner
    const isWinner = winnerId === userId

    const handleMarkBall = async (ball: number) => {
        if (loading || room.status !== 'playing' || !isMyTurn) return
        setLoading(true)
        try {
            const res = await api.game.markBall(gameId, ball)
            if (res.type === 'miss_turn') {
                setAlertModal({
                    title: 'Missed!',
                    message: "You didn't hit any of your cards. Turn passed to next player."
                })
            }
        } catch (e: any) {
            setAlertModal({ title: 'Error', message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handlePassTurn = async () => {
        if (loading || !isMyTurn) return
        setLoading(true)
        try {
            await api.game.passTurn(gameId)
        } catch (e: any) {
            setAlertModal({ title: 'Error', message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handleStartGame = async () => {
        setLoading(true)
        try {
            await api.game.start(gameId)
            onRefresh()
        } catch (e: any) {
            setAlertModal({ title: 'Error', message: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handleResetRound = async () => {
        setConfirmModal({
            title: 'Start Next Round?',
            message: 'This will clear all cards and deal new hands to all players.',
            onConfirm: async () => {
                setConfirmModal(null)
                setLoading(true)
                try {
                    await api.game.resetRound(gameId)
                    onRefresh()
                } catch (e: any) {
                    setAlertModal({ title: 'Error', message: e.message })
                } finally {
                    setLoading(false)
                }
            }
        })
    }

    const handleCloseRoom = async () => {
        setConfirmModal({
            title: 'Close Room',
            message: 'Are you sure you want to close this room? This will end the game permanently.',
            onConfirm: async () => {
                setConfirmModal(null)
                setLoading(true)
                try {
                    await api.game.closeRoom(gameId)
                } catch (e: any) {
                    setAlertModal({ title: 'Error', message: e.message })
                } finally {
                    setLoading(false)
                }
            }
        })
    }

    const jokerEvents = events.filter(e => e.event_type === 'joker_scored')
    const jokerStatsMap: Record<string, { jokers: number; netVsMe: number }> = {}
    players.forEach(p => { jokerStatsMap[p.user_id] = { jokers: 0, netVsMe: 0 } })

    let myTotalNet = 0
    jokerEvents.forEach(e => {
        const shooterId = e.payload.shooter
        const price = e.payload.amount || settings.joker_price || 0
        if (jokerStatsMap[shooterId]) jokerStatsMap[shooterId].jokers += 1
        if (shooterId === userId) {
            opponents.forEach(opp => {
                if (jokerStatsMap[opp.user_id]) jokerStatsMap[opp.user_id].netVsMe += price
            })
            myTotalNet += (players.length - 1) * price
        } else {
            if (jokerStatsMap[shooterId]) jokerStatsMap[shooterId].netVsMe -= price
            myTotalNet -= price
        }
    })

    const renderEvent = ({ item }: { item: GameEvent }) => {
        const event = item
        let iconColor = '#64748b'
        let text = ''

        if (event.event_type === 'game_start') {
            iconColor = '#10b981'
            text = 'Game Started! Good luck.'
        } else if (event.event_type === 'ball_sunk') {
            iconColor = '#3b82f6'
            const shooter = players.find(p => p.user_id === event.payload.shooter)
            const name = shooter ? (shooter.user_id === userId ? 'You' : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : 'Unknown'
            text = `${name} sunk Ball ${event.payload.ball}.`
            if (event.payload.matches > 0) text += ` (${event.payload.matches} cards flipped!)`
            else text += ' (No matches)'
        } else if (event.event_type === 'foul') {
            iconColor = '#ef4444'
            const shooter = players.find(p => p.user_id === event.payload.player)
            const name = shooter ? (shooter.user_id === userId ? 'You' : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : 'Unknown'
            text = `${name} fouled on Ball ${event.payload.ball}.`
            if (event.payload.drawn_card) text += ' Drew a penalty card!'
        } else if (event.event_type === 'joker_scored') {
            iconColor = '#a855f7'
            const shooter = players.find(p => p.user_id === event.payload.shooter)
            const name = shooter ? (shooter.user_id === userId ? 'You' : (shooter.profiles?.username || `Player ${shooter.user_id.slice(0, 4)}`)) : 'Unknown'
            text = `JOKER! ${name} sunk Ball ${event.payload.ball}. Cash transfer!`
        } else if (event.event_type === 'game_end') {
            iconColor = '#eab308'
            text = `GAME OVER! Winner: ${event.payload.winner === userId ? 'You!' : 'Player ' + event.payload.winner.slice(0, 4)}`
        }

        return (
            <View style={styles.eventItem}>
                <View style={[styles.eventDot, { backgroundColor: iconColor }]} />
                <View style={styles.eventContent}>
                    <Text style={styles.eventText}>{text}</Text>
                    <Text style={styles.eventTime}>
                        {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.gameTitle}>CARD POOL</Text>
                {isCreator && (
                    <TouchableOpacity onPress={handleCloseRoom} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.infoBar}>
                <View style={styles.infoChips}>
                    <Text style={styles.infoChip}>{settings.num_players}P / {settings.cards_per_hand}C</Text>
                    <Text style={styles.infoChip}>Joker: ${settings.joker_price}</Text>
                    <Text style={styles.infoChip}>Win: ${settings.end_game_price}</Text>
                </View>

                <View style={styles.turnInfo}>
                    {room.status === 'playing' && (
                        <View style={[styles.turnBadge, isMyTurn && styles.turnBadgeActive]}>
                            <Text style={[styles.turnBadgeText, isMyTurn && styles.turnBadgeTextActive]}>
                                {isMyTurn ? 'YOUR TURN' : `Waiting for ${(() => {
                                    const p = players.find(p => p.user_id === room.current_turn)
                                    return p?.profiles?.username || `Player ${room.current_turn?.slice(0, 4)}`
                                })()}`}
                            </Text>
                        </View>
                    )}
                    <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>
                            {room.status === 'playing' ? `Round ${room.round_number || 1}` : room.status}
                        </Text>
                    </View>
                </View>
            </View>

            {room.status === 'waiting' && isCreator && (
                <TouchableOpacity
                    style={[styles.startButton, (loading || players.length < 2) && styles.buttonDisabled]}
                    onPress={handleStartGame}
                    disabled={loading || players.length < 2}
                >
                    <Text style={styles.startButtonText}>Start Game</Text>
                </TouchableOpacity>
            )}

            {room.status === 'playing' && isMyTurn && (
                <TouchableOpacity
                    style={styles.passButton}
                    onPress={handlePassTurn}
                    disabled={loading}
                >
                    <Text style={styles.passButtonText}>Pass Turn →</Text>
                </TouchableOpacity>
            )}

            <ScrollView style={styles.mainContent}>
                {opponents.length > 0 && (
                    <ScrollView horizontal style={styles.opponentsRow} showsHorizontalScrollIndicator={false}>
                        {opponents.map(opp => {
                            const isTheirTurn = room.current_turn === opp.user_id
                            const jokerCount = jokerEvents.filter(e => e.payload.shooter === opp.user_id).length
                            return (
                                <View key={opp.id} style={[styles.oppCard, isTheirTurn && styles.oppCardActive]}>
                                    <View style={[styles.oppAvatar, isTheirTurn && styles.oppAvatarActive]}>
                                        <Text style={styles.oppAvatarText}>
                                            {opp.profiles?.username?.substring(0, 2).toUpperCase() || opp.user_id.slice(0, 2)}
                                        </Text>
                                    </View>
                                    <Text style={[styles.oppName, isTheirTurn && styles.oppNameActive]}>
                                        {opp.profiles?.username || `Player ${opp.user_id.slice(0, 4)}`}
                                    </Text>
                                    <View style={styles.oppStats}>
                                        <Text style={styles.oppScore}>${opp.score}</Text>
                                        <Text style={styles.oppCards}>{opp.cards_remaining_count} cards</Text>
                                        <Text style={styles.oppJokers}>J{jokerCount}</Text>
                                    </View>
                                </View>
                            )
                        })}
                    </ScrollView>
                )}

                <View style={styles.poolTable}>
                    <View style={styles.tableFelt}>
                        <View style={styles.ballsGrid}>
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                                <PoolBall
                                    key={num}
                                    num={num}
                                    isSunk={sunkBalls.has(num)}
                                    canClick={!!isMyTurn && !loading && room.status === 'playing' && !sunkBalls.has(num)}
                                    onPress={() => handleMarkBall(num)}
                                />
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.handSection}>
                    <View style={styles.handHeader}>
                        <Text style={styles.handTitle}>My Hand</Text>
                        <Text style={styles.handCount}>
                            {myCards.filter(c => c.is_down).length} / {myCards.length} Sunk
                        </Text>
                    </View>
                    <View style={styles.licenseRow}>
                        <Text style={styles.licenseLabel}>License:</Text>
                        <View style={[styles.licenseBadge, myPlayer?.has_license && styles.licenseActive]}>
                            <Text style={[styles.licenseText, myPlayer?.has_license && styles.licenseTextActive]}>
                                {myPlayer?.has_license ? 'ACTIVE' : 'PENDING'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.handCards}>
                        {myCards.length > 0 ? (
                            myCards.sort((a, b) => a.card_value - b.card_value).map(card => (
                                <CardDisplay key={card.id} card={card} />
                            ))
                        ) : (
                            <Text style={styles.noCardsText}>Waiting for game start...</Text>
                        )}
                    </View>
                    <View style={styles.scoreRow}>
                        <Text style={styles.scoreLabel}>Score</Text>
                        <Text style={styles.scoreValue}>${myPlayer?.score || 0}</Text>
                    </View>
                </View>

                <View style={styles.jokerSection}>
                    <Text style={styles.jokerTitle}>Joker Report</Text>
                    <View style={styles.jokerMeRow}>
                        <View style={styles.jokerMeAvatar}>
                            <Text style={styles.jokerMeText}>ME</Text>
                        </View>
                        <View style={styles.jokerMeInfo}>
                            <Text style={styles.jokerMeName}>Me</Text>
                            <Text style={styles.jokerCountText}>{jokerStatsMap[userId]?.jokers || 0} Found</Text>
                        </View>
                        <View style={styles.jokerNet}>
                            <Text style={styles.jokerNetLabel}>Total Net</Text>
                            <Text style={[styles.jokerNetValue, myTotalNet >= 0 ? styles.netPositive : styles.netNegative]}>
                                {myTotalNet >= 0 ? '+' : ''}${myTotalNet}
                            </Text>
                        </View>
                    </View>
                    {opponents.map(opp => {
                        const stats = jokerStatsMap[opp.user_id]
                        const balance = stats?.netVsMe || 0
                        return (
                            <View key={opp.id} style={styles.jokerOppRow}>
                                <View style={styles.jokerOppAvatar}>
                                    <Text style={styles.jokerOppAvatarText}>
                                        {opp.profiles?.username?.substring(0, 2).toUpperCase() || opp.user_id.slice(0, 2)}
                                    </Text>
                                </View>
                                <View style={styles.jokerOppInfo}>
                                    <Text style={styles.jokerOppName}>{opp.profiles?.username || `Player ${opp.user_id.slice(0, 4)}`}</Text>
                                    <Text style={styles.jokerOppJokers}>{stats?.jokers || 0} Found</Text>
                                </View>
                                <View style={styles.jokerOppBalance}>
                                    {balance !== 0 ? (
                                        <>
                                            <Text style={[styles.jokerOwesLabel, balance > 0 ? styles.netPositive : styles.netNegative]}>
                                                {balance > 0 ? 'OWES ME' : 'I OWE'}
                                            </Text>
                                            <Text style={[styles.jokerOwesAmount, balance > 0 ? styles.netPositive : styles.netNegative]}>
                                                ${Math.abs(balance)}
                                            </Text>
                                        </>
                                    ) : (
                                        <Text style={styles.jokerEven}>Even</Text>
                                    )}
                                </View>
                            </View>
                        )
                    })}
                    <Text style={styles.jokerValue}>Joker Value: ${settings.joker_price} / hit</Text>
                </View>

                <View style={styles.activitySection}>
                    <Text style={styles.activityTitle}>Activity Feed</Text>
                    {events.length > 0 ? (
                        events.slice(0, 20).map((event, i) => (
                            <View key={event.id || i}>
                                {renderEvent({ item: event })}
                            </View>
                        ))
                    ) : (
                        <Text style={styles.noEventsText}>No events yet.</Text>
                    )}
                </View>
            </ScrollView>

            <Modal visible={room.status === 'finished'} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.gameEndModal}>
                        <Text style={styles.gameEndTitle}>Game Over!</Text>
                        <Text style={styles.gameEndRound}>Round {room.round_number || 1} Complete</Text>

                        <View style={styles.standingsTable}>
                            <View style={styles.standingsHeader}>
                                <Text style={styles.standingsHeaderText}>Player</Text>
                                <Text style={styles.standingsHeaderText}>Score</Text>
                                <Text style={styles.standingsHeaderText}>Jokers</Text>
                                <Text style={styles.standingsHeaderText}>Net</Text>
                            </View>
                            {players.map(p => {
                                const jCount = jokerEvents.filter(e => e.payload.shooter === p.user_id).length
                                const isMe = p.user_id === userId
                                const isWin = winnerId === p.user_id
                                return (
                                    <View key={p.id} style={[styles.standingsRow, isMe && styles.standingsRowMe]}>
                                        <Text style={[styles.standingsCell, isMe && styles.standingsCellMe]}>
                                            {isMe ? 'You' : (p.profiles?.username || p.user_id.slice(0, 4))}
                                            {isWin ? ' 🏆' : ''}
                                        </Text>
                                        <Text style={styles.standingsCell}>${p.score}</Text>
                                        <Text style={[styles.standingsCell, styles.jokerCell]}>{jCount}J</Text>
                                        <Text style={[styles.standingsCell, p.score > 0 ? styles.netPositive : p.score < 0 ? styles.netNegative : styles.netNeutral]}>
                                            {p.score > 0 ? '+' : ''}${p.score}
                                        </Text>
                                    </View>
                                )
                            })}
                        </View>

                        {isWinner ? (
                            <TouchableOpacity style={styles.nextRoundButton} onPress={handleResetRound} disabled={loading}>
                                <Text style={styles.nextRoundButtonText}>START NEXT ROUND</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.waitingRow}>
                                <Text style={styles.waitingText}>
                                    Waiting for winner to start next round...
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity style={styles.dashboardButton} onPress={() => navigation.navigate('Home')}>
                            <Text style={styles.dashboardButtonText}>Return to Dashboard</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={room.status === 'closed'} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.closedModal}>
                        <Text style={styles.closedTitle}>Room Closed</Text>
                        <Text style={styles.closedRounds}>{room.round_number || 1} Rounds Played</Text>
                        <Text style={styles.closedNet}>
                            Your Net: {(myPlayer?.score ?? 0) > 0 ? '+' : ''}${myPlayer?.score || 0}
                        </Text>

                        <View style={styles.standingsTable}>
                            {players.map(p => {
                                const jCount = jokerEvents.filter(e => e.payload.shooter === p.user_id).length
                                const isMe = p.user_id === userId
                                return (
                                    <View key={p.id} style={[styles.standingsRow, isMe && styles.standingsRowMe]}>
                                        <Text style={[styles.standingsCell, isMe && styles.standingsCellMe]}>
                                            {p.profiles?.username || p.user_id.slice(0, 4)}
                                            {isMe ? ' (You)' : ''}
                                        </Text>
                                        <Text style={[styles.standingsCell, p.score > 0 ? styles.netPositive : p.score < 0 ? styles.netNegative : styles.netNeutral]}>
                                            {p.score > 0 ? '+' : ''}${p.score}
                                        </Text>
                                        <Text style={styles.standingsCell}>{jCount}J</Text>
                                    </View>
                                )
                            })}
                        </View>

                        <TouchableOpacity style={styles.dashboardButton} onPress={() => navigation.navigate('Home')}>
                            <Text style={styles.dashboardButtonText}>Return to Dashboard</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={!!alertModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.alertModalContent}>
                        <Text style={styles.alertTitle}>{alertModal?.title}</Text>
                        <Text style={styles.alertMessage}>{alertModal?.message}</Text>
                        <TouchableOpacity style={styles.alertCloseButton} onPress={() => setAlertModal(null)}>
                            <Text style={styles.alertCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={!!confirmModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.alertModalContent}>
                        <Text style={styles.alertTitle}>{confirmModal?.title}</Text>
                        <Text style={styles.alertMessage}>{confirmModal?.message}</Text>
                        <View style={styles.confirmButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setConfirmModal(null)}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmButton} onPress={confirmModal?.onConfirm}>
                                <Text style={styles.confirmButtonText}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a1a',
    },
    loadingText: {
        color: '#64748b',
        fontSize: 16,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    backButton: {
        padding: 8,
    },
    backButtonText: {
        color: '#94a3b8',
        fontSize: 16,
    },
    gameTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#10b981',
        letterSpacing: -0.5,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    closeButtonText: {
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: 'bold',
    },
    infoBar: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#111827',
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    infoChips: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 6,
    },
    infoChip: {
        backgroundColor: '#1e293b',
        color: '#94a3b8',
        fontSize: 10,
        fontFamily: 'monospace',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        overflow: 'hidden',
    },
    turnInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    turnBadge: {
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    turnBadgeActive: {
        backgroundColor: '#78350f20',
        borderColor: '#f59e0b',
    },
    turnBadgeText: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    turnBadgeTextActive: {
        color: '#fbbf24',
    },
    statusBadge: {
        backgroundColor: '#10b98120',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    statusText: {
        color: '#10b981',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    startButton: {
        backgroundColor: '#10b981',
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    startButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    passButton: {
        backgroundColor: '#d97706',
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    passButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    mainContent: {
        flex: 1,
        padding: 16,
    },
    opponentsRow: {
        marginBottom: 12,
    },
    oppCard: {
        backgroundColor: '#1e293b80',
        borderWidth: 1,
        borderColor: '#33415580',
        borderRadius: 10,
        padding: 10,
        marginRight: 8,
        minWidth: 140,
    },
    oppCardActive: {
        borderColor: '#f59e0b',
        backgroundColor: '#78350f20',
    },
    oppAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#334155',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    oppAvatarActive: {
        borderWidth: 2,
        borderColor: '#f59e0b',
    },
    oppAvatarText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    oppName: {
        color: '#cbd5e1',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    oppNameActive: {
        color: '#fbbf24',
    },
    oppStats: {
        flexDirection: 'row',
        gap: 8,
    },
    oppScore: {
        color: '#10b981',
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    oppCards: {
        color: '#64748b',
        fontSize: 10,
    },
    oppJokers: {
        color: '#a855f7',
        fontSize: 10,
        fontWeight: 'bold',
    },
    poolTable: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        borderWidth: 4,
        borderColor: '#2d2d2d',
        padding: 16,
        marginBottom: 16,
    },
    tableFelt: {
        backgroundColor: '#0e2b58',
        borderRadius: 8,
        padding: 12,
    },
    ballsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    ball: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#333',
        overflow: 'hidden',
    },
    ballDisabled: {
        opacity: 0.5,
    },
    ballSunk: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a1525',
        borderWidth: 1,
        borderColor: '#1e3a8a40',
        opacity: 0.6,
    },
    ballSunkText: {
        color: '#1e3a8a',
        fontSize: 16,
        fontWeight: '900',
    },
    ballStripeBand: {
        position: 'absolute',
        top: 10,
        left: 2,
        right: 2,
        bottom: 10,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 4,
        zIndex: 0,
    },
    ballCenterCircle: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    ballCenterText: {
        color: '#1e293b',
        fontSize: 10,
        fontWeight: '900',
    },
    ballNumber: {
        position: 'absolute',
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ballNumberText: {
        color: '#1e293b',
        fontSize: 10,
        fontWeight: '900',
    },
    stripeOverlay: {
        position: 'absolute',
        top: 10,
        left: 0,
        right: 0,
        bottom: 10,
        backgroundColor: 'transparent',
    },
    handSection: {
        backgroundColor: '#1e293b80',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#33415580',
        marginBottom: 16,
    },
    handHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    handTitle: {
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 'bold',
    },
    handCount: {
        color: '#64748b',
        fontSize: 12,
        backgroundColor: '#1e293b',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155',
    },
    licenseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    licenseLabel: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    licenseBadge: {
        backgroundColor: '#334155',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    licenseActive: {
        backgroundColor: '#10b981',
    },
    licenseText: {
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
    },
    licenseTextActive: {
        color: '#0a0a1a',
    },
    handCards: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    card: {
        width: 56,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    cardDown: {
        backgroundColor: '#cbd5e1',
        borderColor: '#94a3b8',
        opacity: 0.9,
    },
    cardRank: {
        color: '#1e293b',
        fontSize: 20,
        fontWeight: 'bold',
    },
    cardRed: {
        color: '#dc2626',
    },
    cardSuit: {
        color: '#64748b',
        fontSize: 16,
        position: 'absolute',
        bottom: 8,
    },
    sunkOverlay: {
        position: 'absolute',
        inset: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#94a3b860',
        borderRadius: 6,
    },
    sunkText: {
        color: '#475569',
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
    },
    noCardsText: {
        color: '#64748b',
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 16,
    },
    scoreRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#33415540',
        paddingTop: 8,
    },
    scoreLabel: {
        color: '#64748b',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: 'bold',
    },
    scoreValue: {
        color: '#10b981',
        fontSize: 24,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    jokerSection: {
        backgroundColor: '#581c8720',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#a855f720',
        marginBottom: 16,
    },
    jokerTitle: {
        color: '#cbd5e1',
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    jokerMeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff10',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#ffffff20',
        marginBottom: 8,
    },
    jokerMeAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#10b98180',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    jokerMeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    jokerMeInfo: {
        flex: 1,
    },
    jokerMeName: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    jokerCountText: {
        color: '#64748b',
        fontSize: 10,
    },
    jokerNet: {
        alignItems: 'flex-end',
    },
    jokerNetLabel: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: 'bold',
    },
    jokerNetValue: {
        fontSize: 14,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    netPositive: { color: '#10b981' },
    netNegative: { color: '#ef4444' },
    netNeutral: { color: '#64748b' },
    jokerOppRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b80',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#33415540',
        marginBottom: 4,
    },
    jokerOppAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#334155',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    jokerOppAvatarText: {
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: 'bold',
    },
    jokerOppInfo: {
        flex: 1,
    },
    jokerOppName: {
        color: '#cbd5e1',
        fontSize: 12,
        fontWeight: 'bold',
    },
    jokerOppJokers: {
        color: '#64748b',
        fontSize: 10,
    },
    jokerOppBalance: {
        alignItems: 'flex-end',
    },
    jokerOwesLabel: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    jokerOwesAmount: {
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    jokerEven: {
        color: '#334155',
        fontSize: 10,
        fontWeight: 'bold',
    },
    jokerValue: {
        color: '#64748b',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#a855f710',
    },
    activitySection: {
        backgroundColor: '#1e293b80',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#33415580',
        marginBottom: 32,
    },
    activityTitle: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
        paddingBottom: 8,
    },
    eventItem: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b40',
    },
    eventDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 4,
    },
    eventContent: {
        flex: 1,
    },
    eventText: {
        color: '#cbd5e1',
        fontSize: 12,
    },
    eventTime: {
        color: '#475569',
        fontSize: 10,
        marginTop: 2,
    },
    noEventsText: {
        color: '#64748b',
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: '#000000cc',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    gameEndModal: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: '#334155',
    },
    gameEndTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#eab308',
        textAlign: 'center',
        marginBottom: 4,
    },
    gameEndRound: {
        color: '#64748b',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    standingsTable: {
        marginBottom: 16,
    },
    standingsHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingBottom: 8,
        marginBottom: 4,
    },
    standingsHeaderText: {
        flex: 1,
        color: '#64748b',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    standingsRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b80',
    },
    standingsRowMe: {
        backgroundColor: '#1e293b40',
    },
    standingsCell: {
        flex: 1,
        color: '#94a3b8',
        fontSize: 12,
    },
    standingsCellMe: {
        color: '#10b981',
        fontWeight: 'bold',
    },
    jokerCell: {
        color: '#a855f7',
    },
    nextRoundButton: {
        backgroundColor: '#10b981',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginBottom: 8,
    },
    nextRoundButtonText: {
        color: '#fff',
        fontWeight: '900',
        fontSize: 16,
    },
    waitingRow: {
        backgroundColor: '#1e293b80',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
        marginBottom: 8,
    },
    waitingText: {
        color: '#94a3b8',
        fontSize: 12,
    },
    dashboardButton: {
        backgroundColor: '#2563eb',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
    },
    dashboardButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    closedModal: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: '#334155',
    },
    closedTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 8,
    },
    closedRounds: {
        color: '#64748b',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 4,
    },
    closedNet: {
        color: '#e2e8f0',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 16,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    alertModalContent: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 350,
        borderWidth: 1,
        borderColor: '#334155',
    },
    alertTitle: {
        color: '#e2e8f0',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    alertMessage: {
        color: '#94a3b8',
        fontSize: 14,
        marginBottom: 16,
        lineHeight: 20,
    },
    alertCloseButton: {
        backgroundColor: '#334155',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    alertCloseButtonText: {
        color: '#e2e8f0',
        fontWeight: 'bold',
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#334155',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#e2e8f0',
        fontWeight: 'bold',
    },
    confirmButton: {
        flex: 1,
        backgroundColor: '#10b981',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
})
