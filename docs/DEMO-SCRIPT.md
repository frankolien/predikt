# 3-minute demo video script

Target: ≤ 3:00, unlisted YouTube. Goal — prove **both tracks are real and load-bearing** and land
the thesis: *self-custodial money + self-custodial intelligence.*

Pre-roll setup (before recording): `npm run demo`, wait for the model to finish loading (nav shows
"On-device · Llama 3.2"), so the first Gaffer stream is instant on camera.

---

**0:00–0:20 · Hook + thesis**
- Land on the hero. Read the headline: *"Your keys. Your model. Your call."*
- "Gaffer is a football prediction pool for the tournament — but with a twist. Nobody holds the pot,
  and nobody sees your bets. The money is self-custodial USDt. The pundit is an AI that runs entirely
  on your device."
- Point at the nav pill: **On-device · Llama 3.2** and the mode pill. "Everything you'll see runs
  locally — no cloud, no API keys."

**0:20–0:45 · Own your keys (WDK)**
- Scroll to the match room. In "Create a self-custodial wallet", type a name, hit **Create wallet**.
- "That seed was generated locally by Tether's WDK — it never leaves my machine." Reveal the phrase,
  show the address + the minted demo USDt balance.

**0:45–1:30 · Ask the Gaffer (QVAC)**
- On the marquee tie (Argentina v France), click **Ask the Gaffer**.
- Let the analysis **stream in live** (typewriter). "This is a real LLM doing inference on this
  laptop's GPU — token by token, offline." Optional flex: "I can pull the wifi and it keeps going."
- When it resolves, show the **called scoreline**, **confidence bar**, and the **hot-take** pull-quote.
- Click **Use this pick** → it prefills your prediction.

**1:30–2:10 · Call it & stake (WDK escrow)**
- In the prediction form, adjust the scoreline if you like, then **Stake 5 USDT & lock pick**.
- "I'm signing two transactions with my own key — an approve, then a deposit into an on-chain escrow
  contract. Nobody custodies the pot; the contract does." Show the two tx hashes on the locked card.
- Point at the **pool ledger** (the paper "team sheet"): the pot ticks up, your row highlighted
  next to the bot fans who already called it differently.

**2:10–2:45 · Get paid by rule (on-chain settlement)**
- In **Result oracle**, set the full-time score to match a losing pick for the bots and a win for
  you (e.g. your scoreline), hit **Post result**.
- "The oracle can only report a score — the contract does the payout math." Watch the ledger flip to
  **Full time**: winners get **+USDt** paid to their self-custodial wallets, exact-score gets a 🎯,
  losers get nothing. Your nav balance updates.

**2:45–3:00 · Close**
- "Two Tether tracks, both doing real work: QVAC runs the pundit privately on-device, WDK holds the
  keys and drives a trustless escrow. Self-custodial money, self-custodial intelligence — your keys,
  your model, your call."

---

### Shot notes
- Record at 1440p; zoom the browser to ~110% so mono tx-hashes and the scorebug read clearly.
- Have the model pre-loaded so there's no dead air on the first stream.
- If demoing offline is part of the pitch, toggle wifi off *after* the model has loaded.
