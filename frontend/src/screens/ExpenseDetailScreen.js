import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ExpenseDetailScreen({ route }) {
  const { expense } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{expense.title}</Text>
        <Text style={styles.amount}>₹{Number(expense.amount).toFixed(2)}</Text>
        <Text style={styles.label}>Category</Text>
        <Text style={styles.value}>{expense.category}</Text>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{expense.date}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#eef5f2', flex: 1, padding: 20 },
  card: { backgroundColor: '#ffffff', borderRadius: 10, padding: 20 },
  title: { color: '#17202a', fontSize: 26, fontWeight: '700' },
  amount: { color: '#1f7a5a', fontSize: 30, fontWeight: '700', marginVertical: 20 },
  label: { color: '#7b8794', fontSize: 13, marginTop: 12 },
  value: { color: '#17202a', fontSize: 17, marginTop: 4 },
});
