# Webuy Frontend — Complete Feature Reference

Every page, section, button, modal, and interactive element documented.
Use this when converting new UI designs to know what must be preserved.

---

## Global / App-Wide

| Feature | Details |
|---|---|
| **Dark mode** | Jet-black (`#000`) page bg, all surfaces neutral shades. Toggle in Settings, persisted in localStorage. |
| **Sound effects** | Tap, success chime, error buzzer via `soundEffects` util. Mute toggle in Settings. |
| **Notification polling** | Polls every 90s (only while tab visible). Shows unread badge in Navbar bell + Dynamic Island popup for newest unread. |
| **Mail drainer** | Every 5 min, nudges the Vercel email function to flush queued emails. |
| **PWA install prompt** | Banner that prompts install on supported browsers. Dismissible. |
| **Backend error banner** | Amber banner if API unreachable. Dismissible. |
| **Cart persistence** | Cart IDs stored in localStorage, survives refresh. |
| **Settings persistence** | Theme + sound prefs stored in localStorage. |

---

## 1. Landing Page (`LandingPage.tsx`)

Shown to unauthenticated visitors.

| Element | Description |
|---|---|
| Hero headline + subtitle | Marketing copy for Webuy |
| Phone mockup | Static demo of a student dashboard with fake textbooks |
| "Get Started" button | Opens auth page in **signup** mode |
| "Sign In" button | Opens auth page in **signin** mode |

---

## 2. Auth Page (`AuthPage.tsx`)

Full-screen auth, toggles between Sign In and Sign Up.

### Sign In
| Field | Type |
|---|---|
| Email or Reg No | text input |
| Password | password input |
| Submit button | "Sign In" |

### Sign Up
| Field | Type |
|---|---|
| Full Name | text input |
| Reg No | text input |
| Email | email input |
| Phone | tel input |
| Department | dropdown (6 hardcoded options) |
| Level | text input |
| Password | password input |
| Confirm Password | password input |
| Invite Code | text input (joins student to a class) |
| Submit button | "Create Account" |

### OTP Verification Screen
| Element | Description |
|---|---|
| 6-digit OTP input | Individual digit boxes, auto-focus next |
| Submit button | "Verify" |
| Resend link | With 60-second cooldown timer |
| Back link | Returns to signup |

---

## 3. Navbar (`Navbar.tsx`)

Sticky top bar, always visible when authenticated.

| Element | Description |
|---|---|
| Brand logo "W" + "Webuy" | Tapping goes to dashboard |
| "UniPass" badge | Decorative, visible on desktop |
| Faculty subtitle | Shows `profile.faculty` |
| **Student/Rep mode toggle** (desktop) | Pill selector: "Student View" / "Class Rep Portal" — only for class_rep + chief_admin roles |
| **Rep mode toggle** (mobile) | Same toggle as a compact button, only for reps |
| **Notifications bell** | Dropdown showing all notifications (read/unread). "Mark read" button. Unread dot indicator. |
| **Profile dropdown** | Avatar + first name + reg no. Opens dropdown with: full name, reg no, level badge, department badge, Sign Out button |

---

## 4. Bottom Nav (`BottomNav.tsx`)

Floating pill at bottom center, student view only.

| Tab | Icon | Label |
|---|---|---|
| Dashboard | BookOpen | Dashboard |
| History | History | History |
| Settings | Settings | Settings |

Active tab gets indigo bg + white text. Hidden when in rep mode.

---

## 5. Dashboard (`activeTab === 'dashboard'`)

### 5a. Summary Card (`SummaryCard.tsx`)

Flush strip at top of dashboard.

| Element | Description |
|---|---|
| Academic session badge | Green pulse dot + "2025/2026 First Semester" |
| "Pay All" button | Adds all unpaid books to cart, opens cart |
| **Points balance** | Show/hide toggle (eye icon). Displays `wallet.points` |
| **Virtual account info** | Account number, bank name, account name — with copy button |
| "Verify" button | Calls `walletApi.verify()` to reconcile PocketFi deposits. Shows spinner while verifying |
| Progress bar | % of paid books out of total assigned |
| Quick stats | Total assigned, unpaid count, paid count, collected count |

### 5b. Funding Error Banner

Conditional — shows when `wallet.fundingError` exists (usually missing phone).

| Element | Description |
|---|---|
| Warning message | From `wallet.fundingError` |
| "Add phone number" button | Links to Settings tab — only shown if phone is missing |

### 5c. Compulsory Textbooks Section

Flush sticky header with search + filter.

| Element | Description |
|---|---|
| Section title | "Compulsory Course Textbooks" |
| Subtitle | Department + Level |
| **Search input** | Filters by course code, course title, book title, author |
| **Filter dropdown** | Options: All Books, Unpaid, Ready for Pickup, Collected — each with count badge. Colored pill buttons. |
| **Textbook list** | Flat rows (no card bg). Each row = `TextbookCard` |
| Empty state | "No textbooks found" message if no textbooks assigned |

### 5d. TextbookCard (`TextbookCard.tsx`)

Each textbook row has:

| Element | Description |
|---|---|
| **Book cover** | Deterministic gradient from courseCode hash. Shows courseCode + courseTitle + price + level as a mini vertical book |
| Course code + title | Bold text |
| Book title + author | Subtitle |
| Price | Formatted in Naira |
| **Status badge** | Unpaid (amber), Paid (green), Collected (indigo) |
| **Pickup location** | With map pin icon |
| **Lecturer name** | If available |
| **Add to Cart** button | For unpaid books — adds to cart (or removes if already in cart) |
| **View Pass** button | For paid/collected books — opens QR Pass modal |
| **Details** bottom sheet | Tapping the card opens a bottom sheet with full textbook details |

---

## 6. Cart System

### 6a. Floating Cart (`FloatingCart.tsx`)

Draggable floating button, bottom-right. Persisted position in localStorage.

| Element | Description |
|---|---|
| Cart icon | Shopping cart with item count badge |
| Tap to open | Opens CartModal |
| Draggable | User can reposition, saved to localStorage |

### 6b. Cart Modal (`CartModal.tsx`)

Bottom-sheet style modal listing cart items.

| Element | Description |
|---|---|
| Cart items list | Each item shows course code, book title, price |
| Remove button per item | Removes from cart |
| "Clear All" button | Empties cart |
| **Total** | Sum of all items in cart |
| **"Proceed to Checkout"** button | Triggers `startCartCheckout()` — auto-assigns any unassigned books, then opens PaymentBottomSheet |

### 6c. Payment Bottom Sheet (`PaymentBottomSheet.tsx`)

Full checkout flow for cart items.

| Element | Description |
|---|---|
| Items summary | List of books being purchased with individual prices |
| Total cost | Sum displayed prominently |
| Points balance shown | Current wallet balance |
| Insufficient points warning | If total > balance |
| **"Pay with Points" button** | Calls `walletApi.checkout()`. On success: updates wallet remaining balance, refreshes all data |
| Success state | Shows amount spent, remaining balance, success animation |

---

## 7. Transaction History (`activeTab === 'history'`)

`TransactionHistory.tsx`

| Element | Description |
|---|---|
| Flush header | "Transaction History" title, sticky |
| **Search input** | Filters transactions by reference, book title, course code |
| **Filter pills** | All, Purchases, Top-ups, Refunds — count-based |
| **Transaction list** | Each row shows: icon (in/out), book/course info, amount, date, status badge, reference |
| **Scroll behavior** | Count-based: shows first 6 rows, internal scroll for overflow (>6 items) |
| Empty state | "No transactions yet" message |
| Loading state | Skeleton/spinner while data loads |

Each transaction row shows:
- Category icon (purchase=top-up/purchase, refund)
- Direction indicator (in/out)
- Book title + course code
- Amount in Naira
- Status badge (successful/pending/failed)
- Date (relative or formatted)
- Reference number

---

## 8. QR Pass Modal (`QrPassModal.tsx`)

Opens when a paid/collected textbook's "View Pass" is tapped.

| Element | Description |
|---|---|
| QR code | Generated from `passToken` JWT |
| Student name + reg no | Displayed below QR |
| Course code + book title | Textbook info |
| Pickup location | Where to collect |
| Status indicator | Paid / Collected |
| Close button | Dismisses modal |

---

## 9. Settings (`activeTab === 'settings'`)

`Settings.tsx` — flush page layout, no scroll needed.

### Invite Code Section (chief_admin only)
| Element | Description |
|---|---|
| Class name | "Your Class" |
| "Share this code" subtitle | |
| Invite code button | Copy to clipboard. Shows "Copied" confirmation. |

### Edit Profile
| Element | Description |
|---|---|
| "Edit Profile" row | Pencil icon + label + "Free" or "100 pts" badge |
| Opens modal on tap | See Edit Profile Modal below |
| Success feedback | "Profile updated" green text after save |

#### Edit Profile Modal
| Element | Description |
|---|---|
| Header | "Edit Profile" + "First edit is free" or "Costs 100 points" |
| Close (X) button | Closes modal |
| Full Name field | **Read only** — shows current name, grayed out, "Name is tied to your funding account and cannot be changed" |
| Reg No field | Editable input, pre-filled |
| Department field | Editable input, pre-filled |
| Level field | Editable input, pre-filled |
| Cancel button | Closes modal without saving |
| **"Save Changes (Free)"** or **"Save Changes (100 pts)"** | Calls `authApi.updateMe()`. Shows spinner, then checkmark on success. Auto-closes after 1.5s. |
| Error message | Shown below fields if API call fails |

### Appearance Toggle
| Element | Description |
|---|---|
| Sun/Moon icon | Light/dark mode |
| Theme label | "light mode" / "dark mode" |
| Toggle switch | Indigo when dark, slate when light |

### Sound Effects Toggle
| Element | Description |
|---|---|
| Bell/BellOff icon | Sound enabled/disabled |
| Label | "Enabled" / "Muted" |
| Toggle switch | Emerald when on, slate when off |

### Account Section
| Element | Description |
|---|---|
| BadgeCheck icon + "Account" | Section header |
| Email | Displayed in monospace |
| Verification status | Green "Email verified" or amber "Email not yet verified" |

### Phone Number Section
| Element | Description |
|---|---|
| Title + status badge | "Phone Number" + "Saved" or "Required" |
| Description | "PocketFi needs your phone to create your personal funding account." |
| Fee warning | "Changing your phone number costs 200 points." (only if phone already saved) |
| Phone input | Pre-filled with current number |
| Error/success messages | Shown conditionally |
| **"Save Phone Number"** or **"Change Phone Number (200 pts)"** | Calls `walletApi.updatePhone()` |

### Profile Picture Section
| Element | Description |
|---|---|
| Current avatar | Circular image with ring |
| Camera icon overlay | Tap to pick new photo |
| File picker | Hidden input, `image/*` |
| Description | "Upload a photo for your account" |
| Note | Client-side only (base64 in state), not persisted to DB |

### Change Password Section
| Element | Description |
|---|---|
| Lock icon + "Change Password" | Section header |
| Current password input | Required |
| New password input | Min 8 chars |
| Confirm new password input | Must match |
| Error/success messages | Shown conditionally |
| **"Update Password"** button | Calls `authApi.changePassword()` |

### Security Note
| Element | Description |
|---|---|
| ShieldCheck icon | |
| Text | "Your password and payment data are handled by the Webuy backend. We never store your password in this app." |

---

## 10. Class Rep Portal (`activeTab === 'class_rep'`)

`ClassRepPortal.tsx` — full-width dashboard for class reps and chief admins.

### Header Banner
| Element | Description |
|---|---|
| Dark gradient banner | "Class Representative Portal" |
| Title | "Textbook Distribution & Pickup Roster" |
| Description | Instructions for using the roster |
| **"Scan QR Pass" button** | Opens ScanQrModal |

### AccountBalance (`AccountBalance.tsx`)
| Element | Description |
|---|---|
| Common account balance | Naira balance of the shared class account |
| Textbook value | Total value of textbooks in the system |
| Withdrawals total | Amount already withdrawn |
| PocketFi live balance | Real-time PocketFi wallet balance (if available) |
| Recent deposits list | Latest deposits into the account |
| "Verify" button | Reconciles PocketFi balance |

### RepTransactions (`RepTransactions.tsx`)
| Element | Description |
|---|---|
| Recent transactions table | Purchases and payins for the rep's courses |
| Filter tabs | Purchases / Payins |
| Search | By student name, reg no |
| Chief-only view filter | Chief can filter by rep |

### Payouts (`Payouts.tsx`)
| Element | Description |
|---|---|
| **Rep view**: Request payout | Select course, enter copies, provide bank details (account number, bank code, bank name). Calls `repApi.createPayout()`. |
| **Rep view**: My payout requests | List of own payout requests with status |
| **Chief view**: Pending payouts | All payout requests from all reps. "Settle" button to approve. Calls `repApi.settlePayout()`. |
| **Chief view**: Bank resolution | Resolve account number to account name before submitting |
| Bank selector | Dropdown of Nigerian banks from `repApi.getBanks()` |

### ManageTextbooks (`ManageTextbooks.tsx`)
| Element | Description |
|---|---|
| **Add textbook** form | Course code, course title, book title, author, edition, price, ISBN, department, level, lecturer name, pickup location. Calls `repApi.createTextbook()`. |
| **Edit textbook** | Inline edit on existing textbooks. Calls `repApi.updateTextbook()`. |
| **Delete textbook** | Soft-delete (24h restorable). Calls `repApi.deleteTextbook()`. |
| **Restore textbook** | Restores soft-deleted textbook within 24h. |
| **Purge textbook** | Permanently deletes (after 24h or for chief). |
| **Transfer textbook ownership** | Chief can reassign a textbook to another rep. |
| **Grant collection slots** | Chief grants N collection slots to a course (enables rep to mark collected). |
| Deleted textbooks section | Shows soft-deleted textbooks with restore/purge options. |

### UsersManagement (`UsersManagement.tsx`) — chief_admin only
| Element | Description |
|---|---|
| User list | All students in the system |
| Search | By name, reg no |
| Role toggle | Promote/demote between `student` and `class_rep`. Calls `repApi.setUserRole()`. |

### ClassesManagement (`ClassesManagement.tsx`)
| Element | Description |
|---|---|
| Class list | All classes with admin, student count, invite code |
| **Create class** | Name, department, level, optional invite code. Calls `classesApi.create()`. |
| **Change invite code** | Chief can update any class's invite code. Calls `classesApi.changeCode()`. |

### Roster (inline in ClassRepPortal)
| Element | Description |
|---|---|
| Course selector dropdown | Pick a course to view its roster |
| **Export CSV** button | Downloads roster as CSV file |
| **Course detail card** | Dark gradient card showing: course code, book title, author, price, lecturer, pickup location |
| **Metrics grid** | 4 stat cards: Paid Students, Collected, Pending, Total Paid (₦). Plus collection progress bar. |
| **Roster trigger card** | Tapping opens the full roster modal |
| **Roster modal** | Bottom-sheet with: search, filter pills (All/Pending/Collected), student cards |
| **Student card** | Avatar initials, name, reg no, department, reference, status badge, collection toggle switch |
| **Collection toggle** | Switch to mark collected/not collected. Only enabled for the rep who added the book. Disabled when no slots left. |
| **Collection slots info** | Shows remaining slots for the course. Chief can grant more. |
| **Grant slots form** | Chief-only: input number of slots + "Grant" button |

### ScanQrModal (`ScanQrModal.tsx`)
| Element | Description |
|---|---|
| QR scanner | Camera-based QR scanner |
| Paste token input | Alternative: paste token string manually |
| Verify button | Calls `passesApi.verify()` then `passesApi.collect()` |
| Status feedback | Success/error messages for scan results |

---

## 11. Notifications

### NotificationIsland (`NotificationIsland.tsx`)
| Element | Description |
|---|---|
| Dynamic Island popup | Slides in from top when a new unread notification arrives |
| Title + body | Notification content |
| Auto-dismiss | Disappears after a few seconds |
| Manual dismiss | Tap X to close |

### Notification Dropdown (in Navbar)
| Element | Description |
|---|---|
| List of all notifications | Read/unread styling |
| Unread dot | On the bell icon |
| "Mark read" button | Marks all as read |
| Timestamp | Formatted date for each notification |

---

## Data Types Reference

### StudentProfile
`id, regNo, fullName, department, faculty, level, academicSession, email, phone, avatarUrl, emailVerified, freeProfileEditUsed, classId, className, inviteCode`

### Textbook
`id, courseCode, courseTitle, bookTitle, author, edition, price, status (unpaid/paid/collected), coverUrl, department, level, lecturerName, isbn, pickupLocation, classRepName, paidAt, collectedAt, transactionRef, passToken, studentTextbookId, addedBy`

### PaymentTransaction
`id, textbookId, bookTitle, courseCode, amount, fee, total, date, status (successful/pending/failed), reference, method (wallet/bank_transfer/card), category (purchase/topup/refund), direction (in/out), studentRegNo, books[], note`

### WalletTransaction
`id, kind (deposit/purchase/refund), amount, reference, note, created_at`
