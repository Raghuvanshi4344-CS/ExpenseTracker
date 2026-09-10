const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;
const expenses = [];

app.use(cors());
app.use(express.json());

app.get('/api/expenses', (req, res) => {
  res.json(expenses);
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

  expenses.push(expense);
  return res.status(201).json(expense);
});

app.delete('/api/expenses/:id', (req, res) => {
  const expenseIndex = expenses.findIndex((expense) => expense.id === req.params.id);

  if (expenseIndex === -1) {
    return res.status(404).json({ message: 'Expense not found.' });
  }

  expenses.splice(expenseIndex, 1);
  return res.json({ message: 'Expense deleted.' });
});

app.listen(PORT, () => {
  console.log(`ExpenseTrack backend listening on http://localhost:${PORT}`);
});
