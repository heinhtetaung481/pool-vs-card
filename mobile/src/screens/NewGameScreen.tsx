import React, { useState } from 'react'
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
} from 'react-native'
import { api } from '../lib/api'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation'

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'NewGame'>
}

export default function NewGameScreen({ navigation }: Props) {
    const [numPlayers, setNumPlayers] = useState('2')
    const [cardsPerHand, setCardsPerHand] = useState('5')
    const [jokerPrice, setJokerPrice] = useState('1.50')
    const [endGamePrice, setEndGamePrice] = useState('5.00')
    const [loading, setLoading] = useState(false)

    const handleCreate = async () => {
        setLoading(true)
        try {
            const data = await api.game.create({
                num_players: Number(numPlayers),
                cards_per_hand: Number(cardsPerHand),
                joker_price: Number(jokerPrice),
                end_game_price: Number(endGamePrice),
            })
            navigation.replace('Game', { gameId: data.gameId })
        } catch (e: any) {
            Alert.alert('Error', e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.form}>
                <Text style={styles.formTitle}>Create New Game</Text>

                <View style={styles.field}>
                    <Text style={styles.label}>Number of Players</Text>
                    <View style={styles.pickerContainer}>
                        {[2, 3, 4, 5, 6].map(n => (
                            <TouchableOpacity
                                key={n}
                                style={[styles.pickerOption, numPlayers === String(n) && styles.pickerSelected]}
                                onPress={() => setNumPlayers(String(n))}
                            >
                                <Text style={[styles.pickerText, numPlayers === String(n) && styles.pickerTextSelected]}>
                                    {n}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Cards Per Hand</Text>
                    <TextInput
                        style={styles.input}
                        value={cardsPerHand}
                        onChangeText={setCardsPerHand}
                        keyboardType="number-pad"
                        placeholderTextColor="#64748b"
                    />
                    <Text style={styles.hint}>Between 3 and 13</Text>
                </View>

                <View style={styles.row}>
                    <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                        <Text style={styles.label}>Joker Price ($)</Text>
                        <TextInput
                            style={styles.input}
                            value={jokerPrice}
                            onChangeText={setJokerPrice}
                            keyboardType="decimal-pad"
                            placeholderTextColor="#64748b"
                        />
                    </View>
                    <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                        <Text style={styles.label}>Win Bonus ($)</Text>
                        <TextInput
                            style={styles.input}
                            value={endGamePrice}
                            onChangeText={setEndGamePrice}
                            keyboardType="decimal-pad"
                            placeholderTextColor="#64748b"
                        />
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.createButton, loading && styles.buttonDisabled]}
                    onPress={handleCreate}
                    disabled={loading}
                >
                    <Text style={styles.createButtonText}>
                        {loading ? 'Creating...' : 'Create Game Room'}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    content: {
        padding: 16,
        justifyContent: 'center',
        flexGrow: 1,
    },
    form: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
    },
    formTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#10b981',
        textAlign: 'center',
        marginBottom: 24,
    },
    field: {
        marginBottom: 20,
    },
    label: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        padding: 12,
        color: '#e2e8f0',
        fontSize: 16,
    },
    hint: {
        color: '#475569',
        fontSize: 12,
        marginTop: 4,
    },
    row: {
        flexDirection: 'row',
    },
    pickerContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    pickerOption: {
        flex: 1,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    pickerSelected: {
        borderColor: '#10b981',
        backgroundColor: '#10b98120',
    },
    pickerText: {
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: 'bold',
    },
    pickerTextSelected: {
        color: '#10b981',
    },
    createButton: {
        backgroundColor: '#10b981',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
})
