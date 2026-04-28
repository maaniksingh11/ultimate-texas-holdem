# CLAUDE.md

## Project overview

A browser-based **Ultimate Texas Hold'em** casino game built as a single self-contained React component. No external card or casino libraries — all hand evaluation, bet resolution, and jackpot logic is implemented from scratch.

## Stack

- **React 18** (JSX, hooks only — no class components)
- **Vite 5** (dev server + build)
- Zero runtime dependencies beyond React

## File structure

```
UltimateTexasHoldem.jsx   # Entire game: engine + state + styles
src/main.jsx              # React root mount
index.html                # HTML shell
vite.config.js            # Vite config with @vitejs/plugin-react
package.json
```

All game logic lives in `UltimateTexasHoldem.jsx`. There is no separate store, context, or utility module — keep it that way unless the file exceeds ~800 lines and a split is clearly justified.

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

## Game rules implemented

**Variant:** Standard Ultimate Texas Hold'em (casino floor rules)

| Phase   | Player options |
|---------|---------------|
| Betting | Set Ante ($5 min), optional Trips side bet, optional $1 Progressive toggle |
| Pre-flop | Raise 4x or 3x Ante as Play bet (locks Play, skips to showdown), or Check |
| Flop    | Raise 2x Ante as Play bet, or Check |
| River   | Raise 1x Ante as Play bet, or Fold |

- **Blind bet** always mirrors Ante; player cannot adjust it independently.
- **Folding** forfeits Ante + Blind; Trips and Progressive still resolve.
- **Dealer qualifies** with a pair or better — no exceptions.

## Bet resolution rules

### Ante
- Push if dealer does not qualify
- Win 1:1 if player wins (qualifying dealer)
- Lose if dealer wins

### Blind
- Push if dealer does not qualify OR player hand is less than a Straight
- Pays per table if player wins with Straight or better:

| Hand           | Blind pays |
|----------------|-----------|
| Royal Flush    | 500:1     |
| Straight Flush | 50:1      |
| Four of a Kind | 10:1      |
| Full House     | 3:1       |
| Flush          | 3:2       |
| Straight       | 1:1       |

### Play
- Straight win/loss/push vs dealer (1:1)

### Trips (independent of dealer result)

| Hand             | Pays |
|------------------|------|
| Royal Flush      | 50:1 |
| Straight Flush   | 40:1 |
| Four of a Kind   | 30:1 |
| Full House       | 8:1  |
| Flush            | 7:1  |
| Straight         | 4:1  |
| Three of a Kind  | 3:1  |

### Progressive ($1 flat side bet, independent of dealer result)

| Hand             | Payout            |
|------------------|-------------------|
| Royal Flush      | 100% of jackpot (resets to $10,000) |
| Straight Flush   | 10% of jackpot    |
| Four of a Kind   | $300 flat         |

## Hand evaluator

Located at the top of `UltimateTexasHoldem.jsx`. Evaluates all C(7,5) = 21 five-card subsets from the 7-card combined hand (2 hole + 5 community) and returns the best result.

- Rank order: High Card → Pair → Two Pair → Three of a Kind → Straight → Flush → Full House → Four of a Kind → Straight Flush → Royal Flush
- Handles wheel straight (A-2-3-4-5) correctly
- Tiebreaker uses group-sorted card values (quads kicker, two-pair kicker, etc.)

## Scope boundaries

- **Pair splitting** — not applicable (Hold'em, not blackjack)
- **Insurance** — out of scope
- **Pair Plus / any non-standard side bets** — out of scope for v1
- **Multi-player / server state** — out of scope; all state is local React `useState`
- **Persistence** — balance resets on page refresh by design (no localStorage)

## Key invariants — do not break

1. `bestHand()` must always evaluate all 21 combinations — never short-circuit on the first flush found.
2. Blind bet resolution must check dealer qualification **and** player hand rank independently; a non-qualifying dealer always pushes the Blind regardless of player hand.
3. Progressive jackpot resets to `$10,000` only on Royal Flush; partial payouts (Straight Flush, Quads) do not reset it.
4. Folding at the river forfeits exactly Ante + Blind — the Play bet amount is `0` at fold time so no Play stake is lost.
