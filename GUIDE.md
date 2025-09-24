# Secure Chat App: Plain-Language Guide

This guide explains the Secure Chat web app in everyday language. It walks through what the app does, why it is private, and how to use each screen whether you are hosting a room or joining one.

## 1. What this app is

- Secure Chat lets two people talk directly from browser to browser without storing messages on a central server. The welcome screen emphasizes that it is “Secure P2P Chat” with “End-to-end encrypted messaging with no servers” so “Your messages stay on your device.”【F:index.html†L41-L58】
- A status badge in the top corner shows whether you are connected and displays a verification code (called a fingerprint) once the encrypted link is ready, so you can double-check you are talking to the right person.【F:index.html†L23-L36】

## 2. How the privacy protections work (in plain terms)

- **One-time invites, not public links.** When you host a room and press “Generate Secure Invite,” the app prepares a single-use link that automatically expires after 15 minutes.【F:index.html†L92-L112】 You can copy it, email it, or share it using your device’s share menu, and the app clearly reminds you that it only works once and should be kept private.【F:index.html†L96-L119】【F:app.js†L2319-L2368】
- **No sign-ups, just room identities.** Instead of accounts, each room asks you to pick a display name and create a password that only lives on your device. The identity modal provides suggested secure names and requires a password so you can rejoin the same room later.【F:index.html†L213-L260】【F:lib/identity.js†L1-L47】【F:lib/identity.js†L127-L184】 The hint (first few letters) is saved locally so you remember which identity you created, but the full details stay encrypted on your device.【F:lib/identity.js†L153-L158】
- **You can verify you are talking to the right person.** Once a secure connection forms, both sides see the same fingerprint code at the top of the chat. Read the code aloud or compare over another channel to make sure no one is intercepting your messages.【F:index.html†L23-L36】
- **Works even without a constant internet connection.** The service worker caches the core app files so that the interface loads offline, and it falls back to the stored page if your device briefly loses service.【F:sw.js†L1-L53】

## 3. Hosting a secure room

1. On the welcome screen, press **Create Room**.【F:index.html†L62-L70】
2. The “Create Secure Room” screen shows a randomly generated room code you can copy if you plan to reconnect later.【F:index.html†L81-L104】
3. Click **Generate Secure Invite** to produce a one-time link for your guest. The invite panel explains the safety rules—single use, auto-expiring, and no passwords required for the guest.【F:index.html†L92-L112】
4. Share the link:
   - Paste it manually using the **Copy Secure Link** button, or
   - Enter an email address for the app to pre-fill an email draft, or
   - Leave the email box blank and tap **Simple Setup: Share Invite** to open your device’s share menu. The app handles invalid email addresses and falls back to copying the link if your device cannot open a share sheet.【F:index.html†L96-L119】【F:app.js†L2319-L2368】
5. Wait on the chat screen. A banner reminds you to send the link and lets you copy it again while you wait for the guest to claim it.【F:index.html†L149-L187】
6. When your guest connects, the app removes the waiting banner, marks the invite as used, and shows connection details such as the fingerprint and status dot so you can verify the secure link together.【F:index.html†L23-L36】【F:lib/net.js†L21-L186】

## 4. Joining from an invite

1. Open the link your host shared. The Join screen automatically checks the one-time token and shows progress updates like “Claiming your secure seat” and “Verifying one-time token.”【F:index.html†L129-L140】
2. When prompted, choose or type a display name and create a room password. You can use one of the suggested names or type your own; the password strength meter helps you pick something secure.【F:index.html†L213-L246】
3. If you return to the room later on the same device, select **Rejoin Room** and enter the password you created. The hint reminds you which identity you saved.【F:index.html†L248-L260】【F:lib/identity.js†L153-L184】
4. After the secure link is established, compare the fingerprint code with your host to confirm you both see the same value.【F:index.html†L23-L36】

## 5. Touring the chat screen

- **Header:** Shows the room badge, connection status, fingerprint, and quick actions. You can leave the room at any time, toggle “Encrypted View” to see how your outgoing messages look before they are decrypted, or open the “Data Schema” diagnostic view that summarizes what the app is storing locally.【F:index.html†L23-L36】【F:index.html†L149-L170】
- **Waiting banner:** Appears only while you are alone in the room, with a prominent copyable link and gentle reminder of what to do next.【F:index.html†L173-L185】
- **Network bar and announcements:** The strip below the banner reports connection hiccups, and an invisible live region announces system events for screen reader users.【F:index.html†L189-L194】
- **Message area:** Shows your secure conversation, including typing indicators and avatars pulled from each participant’s chosen identity.【F:index.html†L191-L210】【F:lib/identity.js†L142-L150】
- **Message box:** Type and send secure messages from the bottom input field.【F:index.html†L198-L207】

## 6. Seeing who is in the room

- A member sidebar lists everyone connected to the room so you always know who can read messages.【F:index.html†L209-L210】 The app keeps track of identities and updates their online status when they connect or disconnect, based on the profile information that is shared once the encrypted link is up.【F:lib/identity.js†L142-L184】【F:app.js†L2055-L2114】

## 7. Rejoining rooms later

- The welcome screen includes a **Your Recent Rooms** section. It lists rooms you hosted or joined on this device, shows the role you played, and displays miniature avatars of recent participants.【F:index.html†L41-L76】【F:app.js†L2930-L3038】
- Clicking a room card lets you rejoin quickly (after entering the room password you created), copy the room link again, or forget the room if you no longer need it.【F:app.js†L2966-L3040】

## 8. Tips to stay secure

- Always confirm the fingerprint code verbally or through another trusted channel before sharing sensitive information.【F:index.html†L23-L36】
- Share invites privately. They work only once and expire quickly, so send them through a secure medium and do not post them publicly.【F:index.html†L96-L112】【F:app.js†L2319-L2368】
- Keep your room password safe. It unlocks your locally stored identity; if you forget it, you can still join as someone new, but you will not be able to reclaim your previous nickname or avatar without it.【F:index.html†L248-L260】【F:lib/identity.js†L127-L184】
- If the connection status turns red or the fingerprint changes unexpectedly, leave the room and create a new invite to be safe.【F:index.html†L23-L36】【F:app.js†L3457-L3466】

With these steps, even a non-technical guest can set up or join a secure conversation confidently while understanding what each part of the app is doing for their privacy.
