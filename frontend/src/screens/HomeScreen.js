import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExpenseItem from '../components/ExpenseItem';
import { deleteExpense, getExpenses } from '../services/api';

const STORAGE_KEY = '@ExpenseTrack:expenses';

export default function HomeScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    try {
      setLoading(true);
      setError('');
      const serverExpenses = await getExpenses();
      setExpenses(serverExpenses);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serverExpenses));
    } catch (apiError) {
      const savedExpenses = await AsyncStorage.getItem(STORAGE_KEY);
      setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);
      setError('Server unavailable. Showing saved local expenses.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteExpense(id);
    } catch (apiError) {
      setError('Could not reach the server, so this was removed locally.');
    }

    const remainingExpenses = expenses.filter((expense) => expense.id !== id);
    setExpenses(remainingExpenses);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remainingExpenses));
  }

  function confirmDelete(id) {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(id) },
    ]);
  }

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.title}>ExpenseTrack</Text>
        <Text style={styles.total}>₹{total.toFixed(2)}</Text>
        <Text style={styles.label}>Total spent</Text>
        <Text style={styles.count}>{expenses.length} expense{expenses.length === 1 ? '' : 's'}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <Text style={styles.message}>Loading expenses...</Text> : null}

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExpenseItem
            expense={item}
            onPress={() => navigation.navigate('ExpenseDetail', { expense: item })}
            onDelete={() => confirmDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loading ? <Text style={styles.message}>No expenses yet.</Text> : null}
      />

      <Pressable style={styles.addButton} onPress={() => navigation.navigate('AddExpense')}>
        <Text style={styles.addButtonText}>+ Add Expense</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#eef5f2', flex: 1, padding: 16 },
  summary: { marginBottom: 16 },
  title: { color: '#17202a', fontSize: 28, fontWeight: '700' },
  total: { color: '#1f7a5a', fontSize: 32, fontWeight: '700', marginTop: 14 },
  label: { color: '#496579', marginTop: 2 },
  count: { color: '#496579', marginTop: 8 },
  list: { paddingBottom: 90 },
  message: { color: '#496579', paddingVertical: 20, textAlign: 'center' },
  error: { color: '#a33a32', marginBottom: 10 },
  addButton: { backgroundColor: '#1f7a5a', borderRadius: 10, bottom: 18, left: 16, padding: 16, position: 'absolute', right: 16 },
  addButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
