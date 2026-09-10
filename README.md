# ExpenseTrack

A small beginner-friendly React Native expense tracker built with Expo and a simple Express REST API.

## Installation

Prerequisites: Node.js, npm, and Expo Go on a phone or an Android/iOS emulator.

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Frontend dependencies

- `expo`: runs and packages the React Native app.
- `react`: provides components and hooks such as `useState` and `useEffect`.
- `react-native`: provides mobile UI components.
- `@react-navigation/native` and `@react-navigation/native-stack`: move between the three screens.
- `@react-native-async-storage/async-storage`: saves a JSON string on the device.
- `expo-status-bar`: controls the phone status bar appearance.
- `react-native-screens`: helps native screen navigation work correctly.

### Backend dependencies

- `express`: creates the REST API and routes.
- `cors`: allows the mobile app to call the API during development.
- `better-sqlite3`: stores expenses in `backend/data/expenses.db`.

## Start the project

Terminal 1:

```bash
cd backend
npm start
```

Terminal 2:

```bash
cd frontend
npx expo start --lan
```

Use the Expo terminal to open the app on an emulator or scan the QR code with Expo Go. For a physical iPhone, create `frontend/.env` with your computer's local network address:

```env
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:3000/api
```

For example, if the computer's Wi-Fi address is `172.21.162.20`, use `http://172.21.162.20:3000/api`. Keep the phone and computer on the same Wi-Fi network, allow Expo Go's Local Network permission on iOS, and allow ports `8081` and `3000` through Windows Firewall. The backend does not need separate deployment for local testing. Deploy it separately only when the phone must connect from outside your local network; in that case use a public HTTPS API URL instead.

## Folder structure

```text
ExpenseTrack/
├── frontend/
│   ├── App.js
│   ├── package.json
│   └── src/
│       ├── components/ExpenseItem.js
│       ├── screens/
│       │   ├── HomeScreen.js
│       │   ├── AddExpenseScreen.js
│       │   └── ExpenseDetailScreen.js
│       └── services/api.js
├── backend/
│   ├── server.js
│   └── package.json
└── README.md
```

## Important files

- `frontend/App.js`: registers the three screens in a native stack navigator.
- `HomeScreen.js`: loads expenses, calculates totals, displays the `FlatList`, and handles deletion.
- `AddExpenseScreen.js`: owns the form state, validates input, and sends a POST request.
- `ExpenseDetailScreen.js`: displays the expense passed through navigation params.
- `ExpenseItem.js`: reusable child component that receives an expense and callback functions as props.
- `api.js`: keeps all `fetch` calls in one small service file.
- `server.js`: Express routes and SQLite database access.

## How the app works

### Frontend -> API -> backend

`api.js` uses `fetch` to call the backend. Express matches the URL and HTTP method, stores changes in SQLite, and sends JSON back. The frontend then updates its React state and AsyncStorage copy. The SQLite file is created automatically in `backend/data/` and is ignored by git.

### Navigation

`App.js` wraps the app in `NavigationContainer`. The stack has `Home`, `AddExpense`, and `ExpenseDetail` routes. `navigation.navigate('AddExpense')` opens the form, `navigation.goBack()` returns to Home, and Home passes an expense to the detail screen as a route parameter.

### State and hooks

`useState` stores the list, form values, loading state, and error message. `useEffect` runs `loadExpenses` once when HomeScreen first mounts. State changes cause the screen to render again with the newest values.

### Why FlatList?

`FlatList` is made for scrolling lists. It renders list rows efficiently and supports keys, empty states, and item callbacks. Manually writing one component for every expense would not scale as the list grows.

### AsyncStorage

AsyncStorage stores strings locally on the device. This project converts the expense array to JSON with `JSON.stringify` before saving and converts it back with `JSON.parse` when reading. The app saves successful API results locally and uses that copy if the backend is unavailable.

### Add Expense flow

1. The user types into three `TextInput` components.
2. `useState` keeps each input value.
3. The form checks the title, category, and positive numeric amount.
4. `addExpense` sends a POST request.
5. The response is saved to AsyncStorage, then navigation returns to Home.
6. If the server is unavailable, the same expense is saved locally and the user sees a short message.

### Delete flow

The delete button calls `deleteExpense(id)`, which sends `DELETE /api/expenses/:id`. After that, the item is removed from React state and the updated list is saved to AsyncStorage. If the API is unavailable, it is still removed from the local list.
