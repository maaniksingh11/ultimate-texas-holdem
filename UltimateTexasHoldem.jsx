import { useState, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS = ["♠","♥","♦","♣"];
const RED_SUITS = new Set(["♥","♦"]);

const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const BLIND_PAY = [
  { name: "Royal Flush",    min: 9,  pay: 500 },
  { name: "Straight Flush", min: 8,  pay: 50  },
  { name: "Four of a Kind", min: 7,  pay: 10  },
  { name: "Full House",     min: 6,  pay: 3   },
  { name: "Flush",          min: 5,  pay: 3/2 },  // 3:2
  { name: "Straight",       min: 4,  pay: 1   },
];

const TRIPS_PAY = [
  { name: "Royal Flush",    min: 9,  pay: 50  },
  { name: "Straight Flush", min: 8,  pay: 40  },
  { name: "Four of a Kind", min: 7,  pay: 30  },
  { name: "Full House",     min: 6,  pay: 8   },
  { name: "Flush",          min: 5,  pay: 7   },
  { name: "Straight",       min: 4,  pay: 4   },
  { name: "Three of a Kind",min: 3,  pay: 3   },
];

const PROGRESSIVE_PAY = [
  { name: "Royal Flush",    min: 9,  pct: 1.00 },
  { name: "Straight Flush", min: 8,  pct: 0.10 },
  { name: "Four of a Kind", min: 7,  flat: 300  },
];

const HAND_RANK = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3,
  STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9,
};

const HAND_NAMES = [
  "High Card","Pair","Two Pair","Three of a Kind",
  "Straight","Flush","Full House","Four of a Kind",
  "Straight Flush","Royal Flush",
];

const INIT_JACKPOT = 10000;
const PHASES = ["BETTING","PREFLOP","FLOP","RIVER","SHOWDOWN"];

// ─── Deck ────────────────────────────────────────────────────────────────────

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit });
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function dealN(deck, n) {
  return { cards: deck.slice(0, n), remaining: deck.slice(n) };
}

// ─── Hand Evaluator ──────────────────────────────────────────────────────────

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(hand) {
  const vals = hand.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = hand.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => [Number(v), c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groupCounts = groups.map(g => g[1]);

  // Straight detection (including A-2-3-4-5 wheel)
  const uniqueVals = [...new Set(vals)];
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      isStraight = true;
      straightHigh = uniqueVals[0];
    } else if (
      uniqueVals[0] === 14 &&
      uniqueVals[1] === 5 &&
      uniqueVals[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Tiebreaker: flatten groups by value (primary sort: group size desc, value desc)
  const tiebreak = groups.flatMap(([v, c]) => Array(c).fill(v));

  if (isFlush && isStraight) {
    const rank = straightHigh === 14 ? HAND_RANK.ROYAL_FLUSH : HAND_RANK.STRAIGHT_FLUSH;
    return { rank, tiebreak: [straightHigh] };
  }
  if (groupCounts[0] === 4)
    return { rank: HAND_RANK.FOUR_OF_A_KIND, tiebreak };
  if (groupCounts[0] === 3 && groupCounts[1] === 2)
    return { rank: HAND_RANK.FULL_HOUSE, tiebreak };
  if (isFlush)
    return { rank: HAND_RANK.FLUSH, tiebreak: vals };
  if (isStraight)
    return { rank: HAND_RANK.STRAIGHT, tiebreak: [straightHigh] };
  if (groupCounts[0] === 3)
    return { rank: HAND_RANK.THREE_OF_A_KIND, tiebreak };
  if (groupCounts[0] === 2 && groupCounts[1] === 2)
    return { rank: HAND_RANK.TWO_PAIR, tiebreak };
  if (groupCounts[0] === 2)
    return { rank: HAND_RANK.PAIR, tiebreak };
  return { rank: HAND_RANK.HIGH_CARD, tiebreak: vals };
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function bestHand(sevenCards) {
  const combos = getCombinations(sevenCards, 5);
  let best = null;
  for (const combo of combos) {
    const ev = evaluate5(combo);
    if (!best || compareHands(ev, best) > 0) best = ev;
  }
  return best;
}

// ─── Bet Resolution ──────────────────────────────────────────────────────────

function resolveBlind(handRank, anteBet) {
  for (const tier of BLIND_PAY) {
    if (handRank >= tier.min) return Math.round(anteBet * tier.pay);
  }
  return 0; // push if dealer doesn't qualify handled outside
}

function resolveTrips(handRank, tripsBet) {
  if (!tripsBet) return 0;
  for (const tier of TRIPS_PAY) {
    if (handRank >= tier.min) return tripsBet * tier.pay;
  }
  return -tripsBet;
}

function resolveProgressive(handRank, hasBet, jackpot) {
  if (!hasBet) return { payout: 0, resetJackpot: false };
  for (const tier of PROGRESSIVE_PAY) {
    if (handRank >= tier.min) {
      const payout = tier.flat ?? Math.round(jackpot * tier.pct);
      const resetJackpot = tier.pct === 1.00;
      return { payout, resetJackpot };
    }
  }
  return { payout: 0, resetJackpot: false };
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  app: {
    minHeight: "100vh", background: "#076324", fontFamily: "'Segoe UI', sans-serif",
    color: "#fff", padding: "16px", boxSizing: "border-box",
  },
  jackpotBanner: {
    background: "linear-gradient(90deg,#7b2d00,#c0392b,#7b2d00)",
    borderRadius: 8, padding: "10px 24px", textAlign: "center",
    marginBottom: 16, fontSize: 22, fontWeight: "bold", letterSpacing: 2,
    boxShadow: "0 0 16px #c0392b88",
  },
  section: {
    background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 14, marginBottom: 12,
  },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  card: (suit, faceDown) => ({
    width: 54, height: 80, borderRadius: 7, border: "2px solid #bbb",
    background: faceDown ? "linear-gradient(135deg,#1a237e,#283593)" : "#fff",
    color: faceDown ? "transparent" : (RED_SUITS.has(suit) ? "#c0392b" : "#111"),
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", fontSize: faceDown ? 0 : 18, fontWeight: "bold",
    boxShadow: "2px 2px 6px rgba(0,0,0,0.5)", userSelect: "none",
    cursor: "default",
  }),
  cardLabel: { fontSize: 11, marginTop: 2 },
  btn: (disabled, variant) => ({
    padding: "10px 20px", borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: "bold", fontSize: 15,
    background: disabled ? "#555" :
      variant === "danger" ? "#c0392b" :
      variant === "success" ? "#27ae60" : "#e67e22",
    color: "#fff", opacity: disabled ? 0.5 : 1, transition: "opacity 0.2s",
  }),
  input: {
    width: 70, padding: "8px 6px", borderRadius: 5, border: "1px solid #aaa",
    fontSize: 16, textAlign: "center", background: "#fff", color: "#111",
  },
  label: { fontSize: 13, color: "#ccc", marginBottom: 4 },
  resolveRow: (outcome) => ({
    display: "flex", justifyContent: "space-between",
    padding: "4px 0", borderBottom: "1px solid #333",
    color: outcome > 0 ? "#2ecc71" : outcome < 0 ? "#e74c3c" : "#f39c12",
  }),
  h2: { margin: "0 0 10px", fontSize: 18 },
  h3: { margin: "0 0 8px", fontSize: 15, color: "#ddd" },
  net: (n) => ({
    fontSize: 22, fontWeight: "bold", textAlign: "center", marginTop: 12,
    color: n > 0 ? "#2ecc71" : n < 0 ? "#e74c3c" : "#f39c12",
  }),
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function CardView({ card, faceDown }) {
  if (!card) return null;
  return (
    <div style={S.card(card.suit, faceDown)}>
      {!faceDown && (
        <>
          <span>{card.rank}</span>
          <span style={S.cardLabel}>{card.suit}</span>
        </>
      )}
      {faceDown && <span style={{ color: "#fff", fontSize: 24 }}>🂠</span>}
    </div>
  );
}

function CardRow({ cards, label, faceDown }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={S.label}>{label}</div>}
      <div style={S.row}>
        {cards.map((c, i) => (
          <CardView key={i} card={c} faceDown={faceDown} />
        ))}
        {cards.length === 0 && <span style={{ color: "#888", fontSize: 13 }}>—</span>}
      </div>
    </div>
  );
}

function BetInput({ label, value, onChange, disabled, min, max, step }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
      <span style={S.label}>{label}</span>
      <input
        type="number" value={value} min={min ?? 5} max={max ?? 500}
        step={step ?? 5} disabled={disabled}
        onChange={e => onChange(Math.max(min ?? 5, Number(e.target.value)))}
        style={S.input}
      />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function UltimateTexasHoldem() {
  const [phase, setPhase] = useState("BETTING");
  const [jackpot, setJackpot] = useState(INIT_JACKPOT);
  const [balance, setBalance] = useState(1000);
  const [message, setMessage] = useState("");

  // Bet inputs
  const [anteBet, setAnteBet] = useState(10);
  const [tripsBet, setTripsBet] = useState(0);
  const [progBet, setProgBet] = useState(false);

  // Game state
  const [deck, setDeck] = useState([]);
  const [playerHole, setPlayerHole] = useState([]);
  const [dealerHole, setDealerHole] = useState([]);
  const [community, setCommunity] = useState([]);
  const [playBet, setPlayBet] = useState(0);       // 0 = not yet placed
  const [playMultiplier, setPlayMultiplier] = useState(0); // 3,4 / 2 / 1
  const [folded, setFolded] = useState(false);
  const [result, setResult] = useState(null);       // showdown result object

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const cost = anteBet * 2 + tripsBet + (progBet ? 1 : 0);
    if (balance < cost) { setMessage("Insufficient balance."); return; }

    const d = shuffle(buildDeck());
    const { cards: ph, remaining: r1 } = dealN(d, 2);
    const { cards: dh, remaining: r2 } = dealN(r1, 2);

    setBalance(b => b - cost);
    if (progBet) setJackpot(j => j + 1);

    setDeck(r2);
    setPlayerHole(ph);
    setDealerHole(dh);
    setCommunity([]);
    setPlayBet(0);
    setPlayMultiplier(0);
    setFolded(false);
    setResult(null);
    setMessage("");
    setPhase("PREFLOP");
  }, [anteBet, tripsBet, progBet, balance]);

  // ── Pre-flop actions ─────────────────────────────────────────────────────
  const preflopRaise = useCallback((multiplier) => {
    const amount = anteBet * multiplier;
    if (balance < amount) { setMessage("Insufficient balance for raise."); return; }
    setBalance(b => b - amount);
    setPlayBet(amount);
    setPlayMultiplier(multiplier);
    // Skip straight to river reveal
    revealAll(deck, multiplier, amount);
  }, [anteBet, balance, deck]);

  const preflopCheck = useCallback(() => {
    const { cards: flop, remaining } = dealN(deck, 3);
    setCommunity(flop);
    setDeck(remaining);
    setPhase("FLOP");
  }, [deck]);

  // ── Flop actions ─────────────────────────────────────────────────────────
  const flopRaise = useCallback(() => {
    const amount = anteBet * 2;
    if (balance < amount) { setMessage("Insufficient balance."); return; }
    setBalance(b => b - amount);
    setPlayBet(amount);
    setPlayMultiplier(2);
    const { cards: turnRiver, remaining } = dealN(deck, 2);
    const newCommunity = [...community, ...turnRiver];
    setCommunity(newCommunity);
    setDeck(remaining);
    showdown(playerHole, dealerHole, newCommunity, amount, anteBet, tripsBet, progBet, jackpot, false);
  }, [anteBet, balance, deck, community, playerHole, dealerHole, tripsBet, progBet, jackpot]);

  const flopCheck = useCallback(() => {
    const { cards: turnRiver, remaining } = dealN(deck, 2);
    setCommunity(prev => [...prev, ...turnRiver]);
    setDeck(remaining);
    setPhase("RIVER");
  }, [deck]);

  // ── River actions ────────────────────────────────────────────────────────
  const riverRaise = useCallback(() => {
    const amount = anteBet;
    if (balance < amount) { setMessage("Insufficient balance."); return; }
    setBalance(b => b - amount);
    setPlayBet(amount);
    setPlayMultiplier(1);
    showdown(playerHole, dealerHole, community, amount, anteBet, tripsBet, progBet, jackpot, false);
  }, [anteBet, balance, community, playerHole, dealerHole, tripsBet, progBet, jackpot]);

  const riverFold = useCallback(() => {
    setFolded(true);
    // Trips + Progressive still resolve; Ante+Blind+Play forfeited
    const playerBest = bestHand([...playerHole, ...community]);
    const tripsPayout = resolveTrips(playerBest.rank, tripsBet);
    const { payout: progPayout, resetJackpot } = resolveProgressive(playerBest.rank, progBet, jackpot);

    const net = tripsPayout + progPayout; // ante*2 already forfeited at deal time

    if (resetJackpot) setJackpot(INIT_JACKPOT);

    setResult({
      folded: true,
      playerBest,
      dealerBest: bestHand([...dealerHole, ...community]),
      lines: [
        { name: "Ante",        outcome: -anteBet },
        { name: "Blind",       outcome: -anteBet },
        { name: "Play",        outcome: 0 },
        { name: "Trips",       outcome: tripsPayout },
        { name: "Progressive", outcome: progPayout },
      ],
      net,
    });
    setBalance(b => b + Math.max(0, net));
    setCommunity(prev => prev); // already set
    setDealerHole(dh => dh);
    setPhase("SHOWDOWN");
  }, [anteBet, community, playerHole, dealerHole, tripsBet, progBet, jackpot]);

  // ── Full reveal helper ────────────────────────────────────────────────────
  function revealAll(deckSnap, multiplier, playAmount) {
    const { cards: comm, remaining } = dealN(deckSnap, 5);
    setDeck(remaining);
    setCommunity(comm);
    showdown(playerHole, dealerHole, comm, playAmount, anteBet, tripsBet, progBet, jackpot, false);
  }

  // ── Showdown logic ────────────────────────────────────────────────────────
  function showdown(ph, dh, comm, playAmount, ante, trips, prog, jp, isFold) {
    const playerBest = bestHand([...ph, ...comm]);
    const dealerBest = bestHand([...dh, ...comm]);
    const dealerQualifies = dealerBest.rank >= HAND_RANK.PAIR;
    const playerWins = compareHands(playerBest, dealerBest) > 0;
    const tie = compareHands(playerBest, dealerBest) === 0;

    // Ante: push if dealer doesn't qualify; win/lose if qualifies
    let anteOutcome;
    if (!dealerQualifies) anteOutcome = 0; // push — returned
    else if (playerWins) anteOutcome = ante;
    else if (tie) anteOutcome = 0;
    else anteOutcome = -ante;

    // Blind: push on no qualify or player hand < straight
    let blindOutcome;
    if (!dealerQualifies || playerBest.rank < HAND_RANK.STRAIGHT) {
      blindOutcome = 0; // push
    } else if (playerWins || tie) {
      blindOutcome = resolveBlind(playerBest.rank, ante);
    } else {
      blindOutcome = -ante; // player loses blind on qualifying dealer win
    }

    // Play bet
    let playOutcome;
    if (playerWins) playOutcome = playAmount;
    else if (tie) playOutcome = 0;
    else playOutcome = -playAmount;

    // Trips (independent)
    const tripsOutcome = resolveTrips(playerBest.rank, trips);

    // Progressive (independent)
    const { payout: progPayout, resetJackpot } = resolveProgressive(playerBest.rank, prog, jp);

    if (resetJackpot) setJackpot(INIT_JACKPOT);
    else if (progPayout > 0) setJackpot(j => j); // partial — jackpot stays

    const net = anteOutcome + blindOutcome + playOutcome + tripsOutcome + progPayout;

    // Return all bets that push/win (balance reconcile)
    // Items already deducted: ante*2 + trips + prog(1)
    // We get back: pushed bets return their stake; wins return stake+profit; losses lose stake
    const returned =
      ante * (anteOutcome === 0 ? 1 : anteOutcome > 0 ? 2 : 0) +   // ante
      ante * (blindOutcome === 0 ? 1 : 0) +                          // blind push
      (blindOutcome > 0 ? ante + blindOutcome : 0) +                 // blind win
      playAmount * (playOutcome === 0 ? 1 : playOutcome > 0 ? 2 : 0) + // play
      (trips > 0 ? trips + Math.max(0, tripsOutcome) : 0) +         // trips stake back on win
      (prog && progPayout > 0 ? 1 + progPayout : 0);                // prog stake back on win

    setBalance(b => b + returned);

    setResult({
      folded: false,
      dealerQualifies,
      playerBest,
      dealerBest,
      playerWins,
      tie,
      lines: [
        { name: "Ante",        outcome: anteOutcome },
        { name: "Blind",       outcome: blindOutcome },
        { name: "Play",        outcome: playOutcome },
        { name: "Trips",       outcome: tripsOutcome },
        { name: "Progressive", outcome: progPayout },
      ],
      net,
    });
    setPhase("SHOWDOWN");
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = () => {
    setPhase("BETTING");
    setPlayerHole([]);
    setDealerHole([]);
    setCommunity([]);
    setPlayBet(0);
    setFolded(false);
    setResult(null);
    setMessage("");
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const inGame = phase !== "BETTING";
  const showDealer = phase === "SHOWDOWN";

  return (
    <div style={S.app}>
      {/* Jackpot Banner */}
      <div style={S.jackpotBanner}>
        🎰 PROGRESSIVE JACKPOT: ${jackpot.toLocaleString()}
      </div>

      {/* Balance */}
      <div style={{ ...S.section, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 18 }}>Balance: <b>${balance.toLocaleString()}</b></span>
        {phase !== "BETTING" && (
          <span style={{ fontSize: 13, color: "#aaa" }}>
            Phase: <b style={{ color: "#f9ca24" }}>{phase}</b>
          </span>
        )}
      </div>

      {/* Dealer Hand */}
      {inGame && (
        <div style={S.section}>
          <h2 style={S.h2}>Dealer</h2>
          <CardRow
            label="Hole Cards"
            cards={dealerHole}
            faceDown={!showDealer}
          />
          {showDealer && result && (
            <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
              {HAND_NAMES[result.dealerBest.rank]}
              {!result.dealerQualifies && (
                <span style={{ color: "#e67e22" }}> (Does not qualify)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Community Cards */}
      {inGame && (
        <div style={S.section}>
          <h2 style={S.h2}>Community Cards</h2>
          <CardRow cards={community} />
        </div>
      )}

      {/* Player Hand */}
      {inGame && (
        <div style={S.section}>
          <h2 style={S.h2}>Your Hand</h2>
          <CardRow label="Hole Cards" cards={playerHole} faceDown={false} />
          {phase === "SHOWDOWN" && result && (
            <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
              {HAND_NAMES[result.playerBest.rank]}
            </div>
          )}
        </div>
      )}

      {/* Action Panel */}
      <div style={S.section}>
        {phase === "BETTING" && (
          <>
            <h2 style={S.h2}>Place Your Bets</h2>
            <div style={{ ...S.row, marginBottom: 12 }}>
              <BetInput label="Ante (Blind = Ante)" value={anteBet} onChange={setAnteBet} min={5} max={500} step={5} />
              <BetInput label="Trips Bet (0 = skip)" value={tripsBet} onChange={setTripsBet} min={0} max={100} step={5} />
              <div style={{ display: "flex", flexDirection: "column", minWidth: 110 }}>
                <span style={S.label}>Progressive ($1)</span>
                <button
                  style={{
                    ...S.btn(false, progBet ? "success" : undefined),
                    background: progBet ? "#27ae60" : "#555",
                  }}
                  onClick={() => setProgBet(p => !p)}
                >
                  {progBet ? "✓ ON" : "OFF"}
                </button>
              </div>
            </div>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 10 }}>
              Total cost: ${anteBet * 2 + tripsBet + (progBet ? 1 : 0)}
            </div>
            {message && <div style={{ color: "#e74c3c", marginBottom: 8 }}>{message}</div>}
            <button style={S.btn(balance < anteBet * 2)} onClick={startGame}>
              Deal
            </button>
          </>
        )}

        {phase === "PREFLOP" && (
          <>
            <h2 style={S.h2}>Pre-Flop Action</h2>
            <div style={S.row}>
              <button style={S.btn(false, "success")} onClick={() => preflopRaise(4)}>
                Raise 4x (${anteBet * 4})
              </button>
              <button style={S.btn(false, "success")} onClick={() => preflopRaise(3)}>
                Raise 3x (${anteBet * 3})
              </button>
              <button style={S.btn(false)} onClick={preflopCheck}>
                Check
              </button>
            </div>
          </>
        )}

        {phase === "FLOP" && (
          <>
            <h2 style={S.h2}>Flop Action</h2>
            <div style={S.row}>
              <button style={S.btn(false, "success")} onClick={flopRaise}>
                Raise 2x (${anteBet * 2})
              </button>
              <button style={S.btn(false)} onClick={flopCheck}>
                Check
              </button>
            </div>
          </>
        )}

        {phase === "RIVER" && (
          <>
            <h2 style={S.h2}>River Action</h2>
            <div style={S.row}>
              <button style={S.btn(false, "success")} onClick={riverRaise}>
                Raise 1x (${anteBet})
              </button>
              <button style={S.btn(false, "danger")} onClick={riverFold}>
                Fold
              </button>
            </div>
          </>
        )}

        {phase === "SHOWDOWN" && result && (
          <>
            <h2 style={S.h2}>Showdown Result</h2>

            {result.folded ? (
              <div style={{ color: "#e67e22", marginBottom: 8 }}>You folded.</div>
            ) : (
              <div style={{ marginBottom: 8, color: result.playerWins ? "#2ecc71" : result.tie ? "#f39c12" : "#e74c3c" }}>
                {result.playerWins ? "You win!" : result.tie ? "Tie (push)" : "Dealer wins."}
                {!result.dealerQualifies && " (Dealer did not qualify — Ante pushes)"}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              {result.lines.map(line => (
                <div key={line.name} style={S.resolveRow(line.outcome)}>
                  <span>{line.name}</span>
                  <span>
                    {line.outcome > 0 ? `+$${line.outcome}` : line.outcome < 0 ? `-$${Math.abs(line.outcome)}` : "Push"}
                  </span>
                </div>
              ))}
            </div>

            <div style={S.net(result.net)}>
              Net: {result.net >= 0 ? "+" : ""}${result.net}
            </div>

            <div style={{ marginTop: 16 }}>
              <button style={S.btn(false, "success")} onClick={reset}>
                New Hand
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pay Tables */}
      <div style={{ ...S.section, fontSize: 12 }}>
        <h3 style={S.h3}>Blind Pay Table</h3>
        <div style={S.row}>
          {BLIND_PAY.map(t => (
            <span key={t.name} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 8px" }}>
              {t.name}: {t.pay >= 1 ? `${t.pay}:1` : "3:2"}
            </span>
          ))}
        </div>
        <h3 style={{ ...S.h3, marginTop: 10 }}>Trips Pay Table</h3>
        <div style={S.row}>
          {TRIPS_PAY.map(t => (
            <span key={t.name} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 8px" }}>
              {t.name}: {t.pay}:1
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
