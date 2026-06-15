import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { mobileApi, type AuthSession } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Operations'> & {
  session: AuthSession;
};

export function OperationsScreen({ session }: Props) {
  const [items, setItems] = useState<Array<{ operation_id: string; label: string; op_date: string; piece_number: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    mobileApi
      .getOperations(session)
      .then((r) => setItems(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, [session]);

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.operation_id}
        ListEmptyComponent={<Text style={styles.muted}>Aucune opération aujourd&apos;hui</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.piece}>{item.piece_number}</Text>
            <Text>{item.label}</Text>
            <Text style={styles.muted}>{item.op_date}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#e8ecf2' },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 },
  piece: { fontWeight: '700', color: '#0b1f3a' },
  muted: { color: '#5c6b7f', fontSize: 12 },
  error: { color: '#b42318', marginBottom: 8 },
});
