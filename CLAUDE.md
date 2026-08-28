# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tjc-mobile-app` — Expo (SDK 54) / React Native / TypeScript app for TJC Group's internal ERP. It is a **thin client over an existing PHP web system**: nearly every screen is a mobile port of a `.php` page, and all business logic, permissions and data live on the server. UI text and code comments are Thai; dates are displayed in Buddhist era (`year + 543`).

## Commands

```bash
npm start            # expo start (Metro + dev client / Expo Go)
npm run android      # expo run:android  (native build, requires Android toolchain)
npm run ios          # expo run:ios
npm run web          # expo start --web
npx eas build -p android --profile preview      # APK, internal distribution
npx eas build -p android --profile production   # APK
```

No lint or test runner is configured — there is no `test` script and `jest`/`jest-expo` is not installed, so `components/__tests__/StyledText-test.js` (an Expo template leftover) cannot run as-is. `android/` is gitignored prebuild output, not source.

## Backend wiring

[constants/config.ts](constants/config.ts) is the single switchboard for all network access — every screen imports `API_BASE` / `IMG_BASE_URL` / `API_TASKS_URL` from it and no URL is hardcoded elsewhere. **This file is tracked in git and gets flipped between a LAN dev IP and the production host** (history shows ngrok → wuaze → oo.gd → `192.168.x.x`); the specs in [docs/](docs/) refer to production `https://tjcgroup.tjc.co.th`. Check its current value before debugging "the API is down", and be deliberate about committing changes to it.

The PHP backend uses a **single-file action-router** pattern — one file per module, dispatching on `?action=xxx`:

| File | Module |
|---|---|
| `api_mobile.php` | main router (~40 actions): login, profile, reports, history, menus, map, driver tasks, immigration |
| `api_tasks.php` | boss/executive task board (`API_TASKS_URL`) |
| `api_carboooking_mobile.php` | car booking |
| `api_fm.php` | fleet/transport jobs |
| `api_correspondence.php` | correspondence register |
| `api_manager_car.php` | manager car view |

Conventions: reads are `axios.get` with `?action=…` query params; writes are `axios.post` of a `FormData` with `"Content-Type": "multipart/form-data"` (PHP reads `$_POST`). Responses are checked with `res.data.status === "success"` or `res.data.success`. Uploaded files live under `IMG_BASE_URL` subfolders — `uploads/profiles/`, `uploads/docs/`, `uploads/proofs/`. There is no shared axios client and no auth token: API calls are unauthenticated and identify the user by passing `username` / `user_id` / `role` as parameters (a known open item, see [PLAN_book_for_others_mobile.md](docs/PLAN_book_for_others_mobile.md) §13.1).

## Architecture

### Auth lives inside the root layout

[app/_layout.tsx](app/_layout.tsx) holds *both* the `AuthProvider`/`useAuth` context and the navigation gate — there is no separate auth module. Screens import it as `import { useAuth } from "../_layout"`. `signIn` posts FormData to `api_mobile.php?action=login`, stores the `UserData` (including `allowed_pages`) under the AsyncStorage key `"user"`, and `InitialLayout` redirects: no user inside `(tabs)` → `/`, user sitting on the login route → `/(tabs)/news`.

### Routing

- [app/index.tsx](app/index.tsx) — the real login screen (`components/LoginScreen.tsx` is dead template code).
- [app/(tabs)/](app/(tabs)/) — despite the name this is a **Drawer** (`expo-router/drawer`), not tabs. Every feature screen is here.
- [app/history/](app/history/) — report-history detail screens (`sales`, `purchase`, `marketing`, `admin`), pushed as a plain Stack group.

### Permissions are PHP filenames, not route names

`user.allowed_pages` is an array of the *web app's* page filenames (e.g. `"CarBooking.php"`, `"boss dashboard.php"`, `"dashboard_correspondence.php"`), or the string/array `"ALL"`; `role === "admin"` bypasses everything. In [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx), `canAccess(phpFile)` feeds `getDrawerOptions(label, icon, phpFile)`, which hides a screen via `drawerItemStyle: { display: "none" }`. Note this only hides the menu entry — the route itself stays navigable.

Some features carry a second, finer permission layer resolved server-side per request and returned in the payload (e.g. `can_book_for_others` in `get_booking_data`, error `code: "no_permission"` on write).

### Adding a drawer screen takes three edits + a DB row

`CustomDrawerContent` renders **only** routes listed in `MENU_GROUPS` at the top of [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx), grouped under Thai section headers; a group with no visible route is skipped entirely. So a new screen needs:

1. `app/(tabs)/YourScreen.tsx`
2. a `<Drawer.Screen name="YourScreen" options={getDrawerOptions("ป้ายเมนู", "ion-icon", "YourPage.php")} />`
3. its route name added to the right `MENU_GROUPS` entry
4. the matching `.php` name registered in the backend `master_pages` / `permissions` tables, or nobody but admin will see it

Screens deliberately left out of `MENU_GROUPS` (e.g. `ManagerSales`, `ManagerPurchase`, `ManagerMarketing`, `AdminDashboard`, `DriverConfirmItems`) are reachable only by navigation from another screen.

### DB-driven menus

[app/(tabs)/history.tsx](app/(tabs)/history.tsx) and [app/(tabs)/manager_dashboard.tsx](app/(tabs)/manager_dashboard.tsx) don't hardcode their cards — they fetch `get_menus` / `get_manager_menus`, already filtered by role, and each item supplies `label`, `subLabel`, `icon` (FontAwesome5 name), `color` and a **`route` string that is stored in the database**. Creating `app/history/foo.tsx` is therefore useless until a backend menu row points at `/history/foo`.

### Drawer badges

The drawer polls `get_immigration_unread` and `get_boss_dashboard` every 10s and cross-references locally-stored read IDs (`READ_BOSS_TASK_IDS_<userId>` in AsyncStorage). Screens push instant updates back to the drawer with `DeviceEventEmitter.emit("updateImmigrationBadge" | "updateBossBadge" | "updateCreatorBadge")` — keep emitting these when adding read/ack actions, otherwise the badge lags up to 10 seconds.

## Screen conventions

Screens are large, self-contained files (1,000–4,000 lines) that repeat structure rather than share it — follow the neighbouring file rather than trying to extract abstractions:

- A local `const COLORS = { light: {...}, dark: {...} }` block plus `useColorScheme()` from `react-native`. [constants/Colors.ts](constants/Colors.ts) and [components/Themed.tsx](components/Themed.tsx) are unused Expo template scaffolding — do not treat them as the theme system.
- `StyleSheet.create` at the bottom of the file; icons from `@expo/vector-icons` (older screens) or `lucide-react-native` (newer ones).
- Data loading via `axios` inline, `RefreshControl` for pull-to-refresh, `useFocusEffect` to refetch on return.
- Modals hand-rolled with `<Modal>`; several screens implement a local `showAlert(type, title, message, showCancel?, onConfirm?, duration?)` state helper instead of `Alert.alert`. (`sweetalert2` is in `package.json` but unused — it is a web library.)
- Dates: MySQL strings (`YYYY-MM-DD HH:MM:SS`) on the wire, converted with per-file helpers; `react-native-calendars` and `DateTimePicker` are localised to Thai in-file.
- Imports are relative (`../../constants/config`); the `@/*` tsconfig alias exists but is only used by the leftover template files. `typedRoutes` is enabled in [app.json](app.json).

## Specs in docs/

[docs/](docs/) holds Thai-language handoff specs that map the PHP web pages to app screens — DB fields, every `action` with its params and response shape, status enums with colours, and UI behaviour. **Read the relevant spec before modifying these modules**; they are more complete than the code comments:

- [Correspondence_Spec.md](docs/Correspondence_Spec.md) → `correspondence_dashboard.tsx`, `correspondence_book.tsx`
- [FleetSchedule_Spec.md](docs/FleetSchedule_Spec.md) → `fm_jobs.tsx`, `fm_dashboard.tsx`
- [PLAN_book_for_others_mobile.md](docs/PLAN_book_for_others_mobile.md) → `CarBooking.tsx` / `CarDashboard.tsx` group-booking + action permissions (implemented; includes the backend changes it required)
- [correspondence-mobile-prompt.md](app/history/docs/correspondence-mobile-prompt.md) → original build prompt for the correspondence module
