# Win Poster → Telegram: 5-minute setup

You do steps 1–3 once. After that any leader can post a winning poster straight
into the group from the studio.

---

## 1. Create the bot (2 min)

1. In Telegram, open a chat with **@BotFather**.
2. Send `/newbot`.
3. Name it `AG Warriors` and give it a username ending in `bot`, e.g. `ag_warriors_post_bot`.
4. BotFather replies with a token that looks like `8123456789:AAF...`.

**That token is a password for the bot.** Do not paste it into a chat, a
spreadsheet, or a table. It goes straight into the Worker in step 3.

## 2. Put the bot in the group and get the chat id (2 min)

1. Open your MY Warriors group → **Add members** → add the bot.
2. Make it an **admin** (group settings → Administrators). It only needs
   *Post messages*. Telegram silently refuses to let non-admin bots post in
   many group configurations, and this is the single most common reason a send
   fails with "not enough rights".
3. Get the chat id: forward any message from the group to **@userinfobot**, or
   open the group in Telegram Web and read the number from the URL. A supergroup
   id looks like `-1001234567890` — **the minus sign is part of it**.
4. Repeat for the Indonesia group.

## 3. Give the token to the server (1 min)

From `ag-warriors-superapp/worker`:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

Paste the token when prompted. It is stored encrypted by Cloudflare, is never
sent to a browser, and is never written to the database.

## 4. Register each group in the app

Command HQ → **App Content → Poster channels** → add one row per group:

| Field | Example |
|---|---|
| Country | MY |
| Label (what leaders see) | AG Warriors MY |
| Chat id | -1001234567890 |

The chat id is validated on save — a non-numeric value is rejected there rather
than failing later at send time.

---

## How it behaves

- A leader builds the poster, taps **Write 3 for me** for captions, edits if they
  want, then taps the group name.
- They see the **exact image and exact caption** and must press **Send now**.
  Nothing reaches the group before that.
- Every send is recorded in `poster_posts` — who sent it, the caption, the image,
  and Telegram's message id — so a wrong poster can be traced to a person.
- Failures show Telegram's own reason. The two you are likely to see:
  - *chat not found* → the bot is not in that group, or the id is wrong (check the minus sign).
  - *not enough rights* → the bot is in the group but is not an admin (step 2.2).

## What WhatsApp does instead

The **WhatsApp / share** button hands the poster and caption to the phone's own
share sheet, so a leader drops it into any WhatsApp group in one tap.

This is deliberate, not a shortcut. GHL's API can only message **individual
contacts** — it cannot post into a WhatsApp **group** at all. Wiring "broadcast
to the group" through GHL would have meant messaging agents one by one and
calling it a group post. If you later want a genuine broadcast to a contact list,
that is a different feature and it has to respect your approved-template rules.

## If Gemini is down

The caption button falls back to the built-in lines and labels itself
*"built-in lines"* instead of *"written for this closing"*. The studio keeps
working; it just stops being clever. Posting is never blocked by the AI.
