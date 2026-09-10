const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;
const database = new Database(path.join(__dirname, 'data', 'expenses.db'));

database.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL
  )
`);

const listExpenses = database.prepare('SELECT id, title, amount, category, date FROM expenses ORDER BY rowid DESC');
const findExpense = database.prepare('SELECT id, title, amount, category, date FROM expenses WHERE id = ?');
const insertExpense = database.prepare('INSERT INTO expenses (id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)');
const removeExpense = database.prepare('DELETE FROM expenses WHERE id = ?');

app.use(cors());
app.use(express.json());

app.get('/api/expenses', (req, res) => {
  res.json(listExpenses.all());
});

app.post('/api/expenses', (req, res) => {
  const { id, title, amount, category, date } = req.body;

  if (!title || !category || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: 'title, category, and a positive amount are required.' });
  }

  const expense = {
    id: id || Date.now().toString(),
    title,
    amount: Number(amount),
    category,
    date: date || new Date().toISOString().split('T')[0],
  };

  insertExpense.run(expense.id, expense.title, expense.amount, expense.category, expense.date);
  return res.status(201).json(expense);
});

app.delete('/api/expenses/:id', (req, res) => {
  if (!findExpense.get(req.params.id)) {
    return res.status(404).json({ message: 'Expense not found.' });
  }

  removeExpense.run(req.params.id);
  return res.json({ message: 'Expense deleted.' });
});

app.listen(PORT, () => {
  console.log(`ExpenseTrack backend listening on http://localhost:${PORT}`);
});
