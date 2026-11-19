# Mobile test plan: image input in chat

Scope: attaching an image in the chat page (`frontend/src/app/chat/[assistantId]/page.tsx`) on phones. Desktop behaviour was checked separately.

Each case is marked by where it can be run:

- **E** = Chrome phone emulation (viewport, touch, network throttling). Layout and logic only.
- **D** = real device required. Emulation cannot show the system photo picker, the on-screen keyboard, the notch/home-indicator insets, or iPhone photo formats.

Standards used for pass criteria:

- Touch targets: at least 44 x 44 CSS px (Apple HIG; WCAG 2.2 SC 2.5.5), never below 24 x 24 (WCAG 2.2 SC 2.5.8).
- Text inputs at 16 px or larger, so iOS Safari does not zoom the page on focus.
- No horizontal scrolling at 320 px width (WCAG 2.2 SC 1.4.10 Reflow).
- Every control has an accessible name (WCAG 2.2 SC 4.1.2).

## Device matrix

| Viewport | Stands for | Run |
|---|---|---|
| 320 x 568 | smallest supported width (iPhone SE 1st gen) | E |
| 360 x 800 | common Android | E |
| 390 x 844 | iPhone 14/15 | E |
| 430 x 932 | large phone | E |
| 844 x 390 landscape | phone rotated | E |
| iPhone, Safari (current iOS) | real WebKit, HEIC photos | D |
| Android phone, Chrome | real Android picker | D |

## A. Layout and touch

| # | Case | Pass when | Run |
|---|---|---|---|
| A1 | Composer at each viewport, no attachment | Attach button, text field and mic sit on one row; no horizontal scroll | E |
| A2 | Composer with attachment | Thumbnail strip above the row; nothing clipped; no horizontal scroll | E |
| A3 | Touch target sizes | Attach, send, mic at least 44 x 44; thumbnail remove button at least 24 x 24 | E |
| A4 | Text field font size | 16 px or larger | E |
| A5 | Image bubble in transcript | Image never wider than the bubble or the screen | E |
| A6 | Full-size view | Image fits inside the viewport; close button fully on screen; tapping the backdrop closes | E |
| A7 | Landscape | A1, A2 and A6 still hold with the short viewport | E |
| A8 | Accessible names | Attach, remove, send, open-image and close-image controls all have a name | E |
| A9 | Notch and home indicator | Composer is not under the home indicator; close button not under the notch | D |
| A10 | On-screen keyboard open with an attachment | Thumbnail, text field and send button stay visible above the keyboard | D |

## B. Picking and preparing the image

| # | Case | Pass when | Run |
|---|---|---|---|
| B1 | File input attributes | `accept="image/*"`, no `capture` (so the phone offers camera and library) | E |
| B2 | Large photo (12 MP, 4000 x 3000) | Prepared in a few seconds; result is JPEG, long side at most 1568 px, well under the 4 MB limit | E |
| B3 | Same, with a slow phone CPU (4x throttle) | Spinner shows while preparing; UI does not freeze for long | E |
| B4 | Non-image file | Clear message, nothing attached | E |
| B5 | Pick, remove, pick the same file again | Second pick attaches again | E |
| B6 | Replace: pick a second image while one is attached | Thumbnail shows the new image | E |
| B7 | Take a photo with the camera from the picker | Photo attaches, upright | D |
| B8 | Portrait photo from the library (EXIF rotation) | Thumbnail and stored image are upright | D |
| B9 | iPhone HEIC photo | Attaches (Safari converts or decodes it) or shows a clear message | D |
| B10 | Screenshot (PNG) and a Live Photo | Attach as a still image | D |
| B11 | Cancel the picker | Nothing changes, no error | D |

## C. Sending

| # | Case | Pass when | Run |
|---|---|---|---|
| C1 | Image with text | Image and text in one bubble; reply refers to the image | E |
| C2 | Image only | Send button is offered instead of mic; bubble shows only the image | E |
| C3 | While the reply is pending | Attach button disabled; a second image cannot be sent | E |
| C4 | Slow connection (Slow 4G) | Optimistic bubble with image appears at once; reply arrives; no duplicate turn | E |
| C5 | Connection lost when sending | Clear error; no half-saved turn; the user can try again | E |
| C6 | Reload after sending | Image returns in the bubble | E |
| C7 | Background the browser during upload, then return | Turn completes or a clear error shows; no duplicate | D |
| C8 | Mobile data instead of Wi-Fi | C1 completes in acceptable time | D |

## D. Regression on phone

| # | Case | Pass when | Run |
|---|---|---|---|
| D1 | Text-only message | Works as before | E |
| D2 | Assistant with images switched off | No attach button; composer looks as before | E |
| D3 | Hold-to-record voice message | Still works with the attach button next to it; no accidental attach | D |

## Results

### Run 1: 2026-11-19, Chrome phone emulation (E cases only)

Local build of `feature/chat-images`, assistant "Windmill Ecosystem", viewports 320 x 568, 360 x 800, 390 x 844 and 844 x 390 landscape (430 x 932 was skipped, see note). No real device was used, so every **D** case is still open.

| # | Result | Notes |
|---|---|---|
| A1 | Pass | One row, no horizontal scroll at 320, 360, 390 and landscape |
| A2 | Pass | 64 px thumbnail above the row, nothing clipped |
| A3 | Pass after fix | Attach and mic 44 x 44. Remove button is 24 x 24 visually; its tap area was enlarged to 44 x 44. See finding 3 for the send button |
| A4 | Pass | 16 px |
| A5 | Pass | Image stays inside the bubble at every width |
| A6 | Pass after fix | Image and close button fully on screen; backdrop tap closes. Close button was 40 x 40, now 44 x 44 |
| A7 | Pass | Landscape leaves about 310 px for messages with an attachment pending |
| A8 | Pass | All five controls have a name |
| B1 | Pass | `accept="image/*"`, no `capture` |
| B2 | Pass | 4000 x 3000 source became 1568 x 1176 JPEG, about 470 KB, in about 0.2 s |
| B3 | Pass | About 0.8 s at 4x CPU slowdown, spinner shown |
| B4 | Pass | "Please choose an image file.", nothing attached |
| B5 | Pass | |
| B6 | Pass | |
| C1 | Pass | Sent at 390 x 844; the model read the word in the test image |
| C2 | Pass | Checked earlier at desktop width through the share link |
| C3 | Pass | Attach button disabled while the reply is pending |
| C4 | Not run | Chrome's network throttling did not apply to the local servers; needs a real device on mobile data (C8) |
| C5 | Pass after fix | See finding 1 |
| C6 | Pass | |
| D1 | Pass | Text follow-up in the same thread |
| D2 | Pass | No attach button; earlier images in the thread still display |

Note: 430 x 932 was not run separately; the layout is fluid between 390 and the 640 px breakpoint, and both sides of that range passed.

### Findings

1. **Failed send lost the photo and the text (fixed).** When the chat request failed, the attachment and typed text were already cleared and the error read "Failed to fetch". Now the photo and text are put back for a retry, and the message reads "Couldn't reach the server. Check your connection and try again."
2. **Two new controls were under 44 px (fixed).** The full-size view's close button and the thumbnail's remove button.
3. **Send button was 40 x 40 on phones (fixed, existed before this feature).** Now 44 x 44 at phone width; the desktop shape is unchanged.
4. **A failed text-only send lost the typed text (fixed, existed before this feature).** The retry fix in finding 1 now applies to every send: the text is put back unless the user has typed something new.

### Still to run on real devices

A9, A10, B7 to B11, C7, C8, D3, on one iPhone (Safari) and one Android phone (Chrome). The highest-risk ones are B9 (HEIC photos), B8 (photo rotation) and A10 (keyboard covering the composer).
