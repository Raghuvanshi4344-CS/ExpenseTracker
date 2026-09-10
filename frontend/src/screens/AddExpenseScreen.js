import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addExpense } from '../services/api';

const STORAGE_KEY = '@ExpenseTrack:expenses';

export default function AddExpenseScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAddExpense() {
    const numericAmount = Number(amount);

    if (!title.trim() || !category.trim()) {
      Alert.alert('Missing information', 'Please enter a title and category.');
      return;
    }

    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number.');
      return;
    }

    const expense = {
      id: Date.now().toString(),
      title: title.trim(),
      amount: numericAmount,
      category: category.trim(),
      date: new Date().toISOString().split('T')[0],
    };

    try {
      setSaving(true);
      const savedExpense = await addExpense(expense);
      const storedExpenses = await AsyncStorage.getItem(STORAGE_KEY);
      const expenses = storedExpenses ? JSON.parse(storedExpenses) : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...expenses, savedExpense]));
      navigation.goBack();
    } catch (apiError) {
      // Keep the app useful offline when the API cannot be reached.
      const storedExpenses = await AsyncStorage.getItem(STORAGE_KEY);
      const expenses = storedExpenses ? JSON.parse(storedExpenses) : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...expenses, expense]));
      Alert.alert('Saved locally', 'The server is unavailable, so this expense was saved on the device.');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>Expense title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Lunch" />

      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="250" />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Food" />

      <Pressable style={styles.button} onPress={handleAddExpense} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Add Expense'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#eef5f2', flex: 1, padding: 20 },
  label: { color: '#17202a', fontSize: 15, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#ffffff', borderColor: '#c8d8d1', borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 13 },
  button: { backgroundColor: '#1f7a5a', borderRadius: 10, marginTop: 28, padding: 16 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
