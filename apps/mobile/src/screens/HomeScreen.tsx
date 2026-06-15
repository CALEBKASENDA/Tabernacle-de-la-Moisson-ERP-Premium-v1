import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { mobileApi, saveSession, type AuthSession } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'> & {
  session: AuthSession;
  onLogout: () => void;
};

export function HomeScreen({ navigation, session, onLogout }: Props) {
  const [finance, setFinance] = useState<Record<string, unknown> | null>(null);
  const [pastoral, setPastoral] = useState<{ totalMembers: number; cellsCount: number; visitsThisMonth: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([mobileApi.getDashboard(session), mobileApi.getPastoralDashboard(session)])
      .then(([f, p]) => {
        setFinance(f.data as Record<string, unknown>);
        setPastoral(p.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, [session]);

  const logout = async () => {
    await saveSession(null);
    onLogout();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Bonjour, {session.fullName}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {finance && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Finance</Text>
          <Text>Solde : {String(finance.soldeGlobalUsd ?? finance.solde_global_usd ?? '—')} USD</Text>
          <Text>Recettes jour : {String(finance.recettesJourUsd ?? finance.recettes_jour_usd ?? '—')}</Text>
        </View>
      )}
      {pastoral && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pastoral</Text>
          <Text>{pastoral.totalMembers} membres actifs</Text>
          <Text>{pastoral.cellsCount} cellules · {pastoral.visitsThisMonth} visites ce mois</Text>
        </View>
      )}
      <Button title="Opérations du jour" onPress={() => navigation.navigate('Operations')} />
      <View style={{ height: 12 }} />
      <Button title="Déconnexion" color="#b42318" onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#e8ecf2' },
  welcome: { fontSize: 18, fontWeight: '600', marginBottom: 16, color: '#0b1f3a' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  cardTitle: { fontWeight: '700', marginBottom: 8, color: '#0b1f3a' },
  error: { color: '#b42318', marginBottom: 8 },
});
