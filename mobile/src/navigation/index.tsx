import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../lib/auth'
import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import NewGameScreen from '../screens/NewGameScreen'
import GameScreen from '../screens/GameScreen'
import { View, ActivityIndicator, StyleSheet } from 'react-native'

export type RootStackParamList = {
    Login: undefined
    Home: undefined
    NewGame: undefined
    Game: { gameId: string }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function AuthStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
    )
}

function AppStack() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: '#0a0a1a' },
                headerTintColor: '#e2e8f0',
                headerTitleStyle: { fontWeight: 'bold' },
            }}
        >
            <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ title: 'Card Pool', headerShown: false }}
            />
            <Stack.Screen
                name="NewGame"
                component={NewGameScreen}
                options={{ title: 'New Game' }}
            />
            <Stack.Screen
                name="Game"
                component={GameScreen}
                options={{ title: 'Game Room', headerShown: false }}
            />
        </Stack.Navigator>
    )
}

export default function Navigation() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
            </View>
        )
    }

    return (
        <NavigationContainer>
            {user ? <AppStack /> : <AuthStack />}
        </NavigationContainer>
    )
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a1a',
    },
})
