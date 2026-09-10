import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ExpenseItem({ expense, onPress, onDelete }) {
  return (
    <Pressable style={styles.item} onPress={onPress}>
      <View style={styles.details}>
        <Text style={styles.title}>{expense.title}</Text>
        <Text style={styles.category}>{expense.category}</Text>
        <Text style={styles.date}>{expense.date}</Text>
      </View>
      <View style={styles.rightSide}>
        <Text style={styles.amount}>₹{expense.amount}</Text>
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 16,
  },
  details: { flex: 1 },
  title: { color: '#17202a', fontSize: 17, fontWeight: '600' },
  category: { color: '#496579', marginTop: 5 },
  date: { color: '#7b8794', fontSize: 12, marginTop: 5 },
  rightSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
  amount: { color: '#1f7a5a', fontSize: 17, fontWeight: '700' },
  deleteButton: { paddingTop: 10 },
  deleteText: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
});
