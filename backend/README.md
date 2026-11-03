Dự án niên luận nhà hàng HGH dùng laravel
"# ReactJS-Laravel-HGH-Restaurant" 


## Chat images and saved invoices

Chat uploads and server-generated receipt images are saved as real JPEGs in
`public/chat_pictures/{ID}_pics/{ID}_pics_{dd-mm-yy}/{ID}_{NNN}_{dd-mm-yy}.jpg`.
The sequence is shared by uploads and receipts for that user/day; a filesystem lock
prevents concurrent requests from overwriting each other. Existing originals are
kept when converting older referenced files. Chat image links still use signed URLs.

The server needs Python 3 and project-local Pillow. From the backend directory run
`python -m pip install --target .runtime/python -r scripts/requirements-chat-images.txt`.
The converter loads this directory explicitly, including when the web worker has
user-site packages disabled. Use the same Python version/architecture as the server;
repeat setup after changing interpreters. Do not commit `.runtime` binaries.
It also needs
Chrome/Chromium for rendering the trusted receipt SVG to JPEG. Configure
`CHAT_IMAGE_PYTHON` and `CHAT_IMAGE_BROWSER` if these binaries are not discoverable.
Rendering uses argument arrays, a temporary browser profile, and bounded timeouts;
no customer-supplied SVG is accepted. The SVG template is an intermediate render
format only, not the stored customer image.

The invoice reference is included in the original `chat_messages` table migration.
Convert/index existing message attachments with `php artisan chatbot:organize-images`;
add `--dry-run` to inspect counts, or `--analyze` to recognize receipt codes in older
uploaded images using Gemini. If recognition is unavailable, conversion still
succeeds and recognition can be retried later. Originals are not deleted.

Receipt codes from newly uploaded images are verified against the sender's orders
before indexing. The free-text assistant receives up to 60 recent saved invoices
from that account, including order date, image-save date, dishes, quantities and
subtotal. It can select one image or ask for clarification. The server validates
that selection again, returns the saved image, and builds the order link itself.
An unmatched search must not be presented as proof that an order does not exist.


## Customer screenshot advice

The widget uploads up to five images with `caption` and `ack=0`, then makes one
`chatbot/interact` request with the server-returned `visual_message_ids`, optional
`user_input`, `lang`, `page_path` (pathname only), and `theme` (`light`/`dark`).
The server checks image ownership and availability, moderates the combined text
and images, and passes the actual raster bytes to Gemini with website knowledge.
An empty caption is supported without creating a synthetic customer message.
Legacy deferred-text requests remain compatible.

A session retains only the last approved image IDs and a bounded observation
summary for 30 minutes. Follow-up text can use those images while they still
exist. Deleting a referenced image clears that visual context. The client never
supplies filesystem paths or image URLs for this lookup; page context is an
allowlisted hint, not authority. User-facing failures stay in the requested
language and do not expose exception details or internal technology.

The knowledge file now includes the customer-screen guide. Admin screens remain
out of scope. Generic screenshot errors do not establish a cause, and a generic
payment failure must not advise another payment before checking transaction
history. A suggested link to the current page is suppressed; opening one verified
invoice can still offer its exact order link.



### Sending screenshots and retrying

The widget immediately adds local image/caption bubbles and clears the composer.
A per-batch status distinguishes uploading from reviewing. Transient errors stay
inline with a Retry button. `sendVisualJob` retains each accepted message ID, so
partial-upload and advice retries do not upload the same file again. Blob previews
remain available until replacement by the accepted image or widget cleanup.

Upload moderation stores a 10-minute, server-owned hash binding the approved
caption to each image. The exact same caption/image batch can proceed to advice
without a second vision moderation call. Changed captions, expired approvals and
unapproved images still require moderation; ownership is always checked first.
Regular follow-ups moderate new text and reuse the already-approved visual context.

`client_request_id` is a UUID. Advice replies are cached per authenticated account
and request ID for 10 minutes, protected by a lock, so retrying after a lost response
does not duplicate messages or call Gemini again. Visual advice allows up to 30
seconds for generation; the widget request timeout is 75 seconds. This does not
promise fixed response times from Gemini.


## Database migrations and demo reset

Each migration creates one complete table. Later selection, nullable ingredient
snapshot and invoice-reference changes have been folded into their original table
definitions; the one-off legacy image-lock data cleanup is no longer needed for a
fresh database.

This migration set is a fresh-install baseline. If a database was created with the
previous migration history, reset the demo instead of applying only the new files:

```shell
php artisan migrate:fresh --seed
```

Run this from `backend`. It removes existing database data and rebuilds the demo;
the seeder also resets generated dish images, avatars and public chat pictures.
Seeded order dates are generated through the current month. Source dish pictures
`public/pics/00.jpg` and `public/pics/1.jpg` through `30.jpg` must be present.
Generated chat pictures, logs, QA reports and runtime dependencies are not source
assets to commit. Old feature/QA test cases have been removed as part of demo
cleanup; the Laravel test scaffold remains for future tests.
