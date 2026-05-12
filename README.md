# Yoga Class Booking

This workspace is a free web app starter for yoga class registration.

## What this app supports

- Max 6 seats per class
- Student signup with live updates
- Student self-cancel
- Status update between:
  - 未付留位費
  - 已付留位費 ✅
- Upcoming classes and history view
- Class can include 1 or 2 levels from Lv0, Lv1, Lv2
- One song per selected level

## Files

- index.html: student page
- admin.html: teacher page
- styles.css: shared style
- app.js: student logic
- admin.js: teacher logic
- firebase.js: Firebase setup (replace placeholders)
- firestore.rules: starter rules

## Setup

1. Create a Firebase project and Firestore database.
2. In firebase.js, replace all REPLACE_ME values with your Firebase config.
3. Deploy firestore.rules in Firebase console.
4. In admin.js, change ADMIN_PASSWORD to your own password.
5. Push this folder to a GitHub repository.
6. Enable GitHub Pages for the repository.
7. Share the generated page link on Instagram.

## Notes

- Current Firestore rules allow all writes for quick launch.
- Before production, tighten rules with authentication.
