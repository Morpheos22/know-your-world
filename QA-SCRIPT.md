# Know Your World — QA Testing Script

## Pre-requisites

- Browser (Chrome/Firefox/Safari)
- Network tab open
- Console tab open

---

## 1. Homepage Tests

| #   | Test                                             | Expected                                       | Pass/Fail |
| --- | ------------------------------------------------ | ---------------------------------------------- | --------- |
| 1.1 | Load homepage                                    | Title "Know Your World" + globe visible        |           |
| 1.2 | Footer visible                                   | "Developed by Morpheos for Athena Agentic Ltd" |           |
| 1.3 | Sign Up/Sign In button visible before name entry | Button with PRO badge                          |           |
| 1.4 | Favicon shows globe                              | Browser tab shows globe icon                   |           |
| 1.5 | Globe animation                                  | Spins twice then stops (~12s)                  |           |
| 1.6 | Hold globe 3+ seconds                            | Mini-game overlay opens                        |           |
| 1.7 | Mute button                                      | Toggles sound on/off                           |           |
| 1.8 | Enter name + click Let's Go                      | Navigates to continent selection               |           |
| 1.9 | "Not [Name]? Click here"                         | Clears name, shows name entry                  |           |

## 2. Continent Selection

| #   | Test                | Expected                                 | Pass/Fail |
| --- | ------------------- | ---------------------------------------- | --------- |
| 2.1 | 5 continents shown  | Africa, Asia, Europe, Americas, AI World |           |
| 2.2 | Each shows progress | "0/4 started" for new players            |           |
| 2.3 | Click AI World      | Navigates to AI categories               |           |
| 2.4 | Back button         | Returns to home                          |           |

## 3. AI World Quiz

| #    | Test                                 | Expected                                         | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------ | --------- |
| 3.1  | 3 AI categories shown                | Generative AI, Copilots, Software Agents         |           |
| 3.2  | Select Generative AI                 | Quiz starts at Level 1 (Easy)                    |           |
| 3.3  | HUD shows "AI World · Generative AI" | Correct continent/category in HUD                |           |
| 3.4  | A/B/C/D labels on options            | Letter badges visible                            |           |
| 3.5  | Listen button (👂)                   | Toggles play/stop on click                       |           |
| 3.6  | Answer correctly                     | Score increments, advances to next               |           |
| 3.7  | Answer incorrectly                   | Score stays, advances to next                    |           |
| 3.8  | Fact card appears                    | "💡 Fun fact!" label, doesn't count toward score |           |
| 3.9  | Complete quiz                        | Result modal appears with score X/8              |           |
| 3.10 | Score submits to API                 | Check Network tab for POST /api/scores           |           |

## 4. Voice System

| #   | Test                       | Expected                           | Pass/Fail |
| --- | -------------------------- | ---------------------------------- | --------- |
| 4.1 | Click 🎤 Voice on home     | Voice picker modal opens           |           |
| 4.2 | 3 freemium voices          | Jessica, Laura, Charlie            |           |
| 4.3 | 10 premium voices (locked) | Show lock icon + 4s preview button |           |
| 4.4 | Select Jessica             | Checkmark appears                  |           |
| 4.5 | Preview premium voice      | Plays 4s demo audio                |           |
| 4.6 | Close modal                | Selected voice persists            |           |

## 5. Auth System

| #   | Test                        | Expected                  | Pass/Fail |
| --- | --------------------------- | ------------------------- | --------- |
| 5.1 | Click Sign Up/Sign In       | Auth modal opens          |           |
| 5.2 | Google button visible       | OAuth redirect works      |           |
| 5.3 | GitHub button visible       | OAuth redirect works      |           |
| 5.4 | Pi button visible           | Gold button               |           |
| 5.5 | Email signup                | Verification email sent   |           |
| 5.6 | After GitHub login          | Onboarding flow appears   |           |
| 5.7 | Blocked user (Faiza Fadipe) | Access Denied screen      |           |
| 5.8 | Signed in state             | Shows username + Sign Out |           |

## 6. Onboarding Flow

| #   | Test                        | Expected                          | Pass/Fail |
| --- | --------------------------- | --------------------------------- | --------- |
| 6.1 | 3 plan options shown        | Individual, Startup, Organization |           |
| 6.2 | Pi pricing shown            | 750π, 1500π, 3000π                |           |
| 6.3 | Select Individual → Payment | Stripe + Pi options               |           |
| 6.4 | Skip option                 | "Skip for now — I'll play free"   |           |
| 6.5 | Startup details form        | Name, website, MVP1, MVP2, bio    |           |
| 6.6 | Organization details form   | Organization name                 |           |

## 7. Leaderboard

| #   | Test                     | Expected                 | Pass/Fail |
| --- | ------------------------ | ------------------------ | --------- |
| 7.1 | No filters               | Global leaderboard       |           |
| 7.2 | Top 3 badges             | 🥇 🥈 🥉 + HONOUR badge  |           |
| 7.3 | Includes AI World scores | AI World entries visible |           |

## 8. Tip Modal

| #   | Test                 | Expected                           | Pass/Fail |
| --- | -------------------- | ---------------------------------- | --------- |
| 8.1 | Click Tip            | Modal with ₦500, ₦1k, ₦2k + custom |           |
| 8.2 | Click tip amount     | Redirects to Stripe                |           |
| 8.3 | Custom amount < ₦100 | Button disabled                    |           |

## 9. Security Checks

| #   | Test                    | Expected                          | Pass/Fail |
| --- | ----------------------- | --------------------------------- | --------- |
| 9.1 | Right-click disabled    | Context menu blocked              |           |
| 9.2 | F12 disabled            | DevTools shortcut blocked         |           |
| 9.3 | Ctrl+U disabled         | View source blocked               |           |
| 9.4 | Image drag disabled     | Can't drag images                 |           |
| 9.5 | Text selection disabled | Can't select text (except inputs) |           |
| 9.6 | No secrets in bundle    | Check View Source → no API keys   |           |

## 10. Responsiveness

| #    | Test             | Expected                          | Pass/Fail |
| ---- | ---------------- | --------------------------------- | --------- |
| 10.1 | Mobile (375px)   | All elements visible, no overflow |           |
| 10.2 | Tablet (768px)   | Layout adapts                     |           |
| 10.3 | Desktop (1280px) | Full layout                       |           |
| 10.4 | Quiz on mobile   | HUD readable, buttons tappable    |           |
| 10.5 | Modals on mobile | Fit within viewport               |           |
