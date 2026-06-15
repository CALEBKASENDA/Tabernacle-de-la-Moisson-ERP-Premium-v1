import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { loadSession, type AuthSession } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OperationsScreen } from './src/screens/OperationsScreen';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Operations: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0b1f3a" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0b1f3a' }, headerTintColor: '#fff' }}>
        {!session ? (
          <Stack.Screen name="Login" options={{ title: 'Tabernacle ERP' }}>
            {(props) => <LoginScreen {...props} onLoggedIn={setSession} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Home" options={{ title: 'Tableau de bord' }}>
              {(props) => <HomeScreen {...props} session={session} onLogout={() => setSession(null)} />}
            </Stack.Screen>
            <Stack.Screen name="Operations" options={{ title: 'Opérations du jour' }}>
              {(props) => <OperationsScreen {...props} session={session} />}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
