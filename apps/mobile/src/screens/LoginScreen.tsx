import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { mobileApi, saveSession, type AuthSession } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'> & {
  onLoggedIn: (s: AuthSession) => void;
};

export function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await mobileApi.login(email.trim(), password);
      const session: AuthSession = {
        sessionId: res.data.sessionId,
        accessToken: res.data.accessToken,
        churchId: res.data.churchId,
        userId: res.data.userId,
        fullName: res.data.fullName,
        email: res.data.email,
      };
      await saveSession(session);
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tabernacle ERP Mobile</Text>
      <TextInput style={styles.input} placeholder="Courriel" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={loading ? 'Connexion…' : 'Se connecter'} onPress={handleLogin} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#e8ecf2' },
  title: { fontSize: 22, fontWeight: '700', color: '#0b1f3a', marginBottom: 24, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#d4dce8' },
  error: { color: '#b42318', marginBottom: 12 },
});
