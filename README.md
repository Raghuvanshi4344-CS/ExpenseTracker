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

## Start the project

Terminal 1:

```bash
cd backend
npm start
```

Terminal 2:

```bash
cd frontend
npm start
```

Use the Expo terminal to open the app on an emulator or scan the QR code with Expo Go. The frontend uses `http://10.0.2.2:3000` on Android Emulator and `http://localhost:3000` on iOS Simulator/web. For a physical phone, replace the address in `frontend/src/services/api.js` with your computer's local network IP address.

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
- `server.js`: Express routes and the in-memory `expenses` array.

## How the app works

### Frontend -> API -> backend

`api.js` uses `fetch` to call the backend. Express matches the URL and HTTP method, changes the in-memory array, and sends JSON back. The frontend then updates its React state and AsyncStorage copy.

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

## 15 interview questions and simple answers

1. **What is React Native?** React Native lets us build native mobile interfaces using JavaScript and React components.
2. **Why did you use Expo?** Expo provides a simple development toolchain and lets me run the app quickly on a device or emulator.
3. **What does `useState` do?** It stores changing values and causes the component to re-render when a setter changes them.
4. **Why is `useEffect` used here?** It runs the initial data-loading side effect after HomeScreen mounts.
5. **Why use `FlatList`?** It is designed for efficient, scrollable rendering of arrays of data.
6. **How does navigation work?** A native stack contains named screens, and navigation methods move between those screens.
7. **How does Add Expense validate data?** It checks trimmed text fields and confirms the amount is a finite number greater than zero.
8. **What is a prop in this project?** `ExpenseItem` receives the expense and callback functions from `HomeScreen` as props.
9. **Why create `ExpenseItem`?** It keeps the repeated row UI in one small reusable component.
10. **How does the app call the backend?** `api.js` uses `fetch` with GET, POST, and DELETE requests.
11. **Why use Express?** Express gives us a small, readable way to define HTTP routes in Node.js.
12. **Where is backend data stored?** In the `expenses` JavaScript array, so it resets when the server restarts.
13. **What is AsyncStorage?** It is simple persistent key-value storage for strings on the device.
14. **What happens if the API is down?** Home loads its AsyncStorage copy, and a new expense can be saved locally as a basic offline fallback.
15. **How would you improve this for production?** I would add a database, authentication, stronger validation, environment-based API URLs, and better offline synchronization.
