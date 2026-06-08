# Player avatars

Drop the 5 profile pictures here as:

- `p1.png`
- `p2.png`
- `p3.png`
- `p4.png`
- `p5.png`

Square images ~256×256 work best. The frontend falls back to coloured initials if a file is missing, so you can ship without them and add later.

Player names and colours live in `src/worker.ts` (`DEFAULT_PLAYERS`) — or set them via the admin `PUT /api/players` endpoint to override without redeploying.
