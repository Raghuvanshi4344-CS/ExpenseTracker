import { Platform } from 'react-native';

// Set EXPO_PUBLIC_API_URL for a physical phone; localhost points to the device.
const API_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android'
  ? 'http://10.0.2.2:3000/api'
  : 'http://localhost:3000/api');

async function readResponse(response) {
  if (!response.ok) {
    throw new Error('The server returned an error.');
  }

  return response.json();
}

export async function getExpenses() {
  const response = await fetch(`${API_URL}/expenses`);
  return readResponse(response);
}

export async function addExpense(expense) {
  const response = await fetch(`${API_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expense),
  });

  return readResponse(response);
}

export async function deleteExpense(id) {
  const response = await fetch(`${API_URL}/expenses/${id}`, {
    method: 'DELETE',
  });

  return readResponse(response);
}
