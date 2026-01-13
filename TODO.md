## Authentication & Security
- [X] Implement 3rd-party authentication  
- [ ] Evaluate passwordless authentication (login link preferred if easy)
- [ ] Fix CORS issues
- [X] Ensure chat link security
- [X] Enforce single active session per LLM Thing  
  - If a new device opens the link, terminate the previous session  
  - Later: show an error or modal saying *“A new session is active”*

## Database & Backend Configuration
- [X] Finalize DB configuration
- [X] Decide on Supabase usage  
  - Should SQLite be skipped entirely?
- [X] Ensure all LLM responses are stored correctly

## MQTT
- [X] Make sure MQTT feed is updated in real time
- [X] Make MQTT connection persistent
- [X] Differentiate between user connections in MQTT server
- [X] Warn user when message is not being sent to MQTT broker

## Database Schema
- [X] Create table for users
- [X] Create table for LLM Things
- [X] Create table for LLM API responses

## Data Retention & Lifecycle
- [X] Ensure all chat history always remains accessible via the link
- [X] If an LLM Thing is deleted, keep its data in the database
- [ ] Later: add a first-use modal explaining that log data is kept for research purposes  
  - Logs are unbounded to the user’s email address

## Export & Data Access
- [X] Provide a downloadable version containing:
  - Chat history (user + AI)
  - MQTT message history
- [X] Use JSON as a baseline format  
  - Explore more readable alternatives

## Performance & Reliability
- [ ] Set up load testing

## Input & Interaction
- [X] Implement microphone input

## Other
- [X] Ask for confirmation before deleting a session
- [X] Check QR code functionality (probably broken from introduction of JWT)
- [X] Add button redirecting to dashboard
- [X] Show loading until all information is loaded
- [X] Fix message responses sometimes not being parsed in the chat
- [X] Ensure flow of conversation