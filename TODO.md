## Authentication & Security
- [X] Implement 3rd-party authentication  
- [ ] Evaluate passwordless authentication (login link preferred if easy)
- [ ] Fix CORS issues
- [ ] Ensure chat link security
- [ ] Enforce single active session per LLM Thing  
  - If a new device opens the link, terminate the previous session  
  - Later: show an error or modal saying *“A new session is active”*

## Database & Backend Configuration
- [ ] Finalize DB configuration
- [ ] Decide on Supabase usage  
  - Should SQLite be skipped entirely?
- [ ] Ensure all LLM responses are stored correctly

## Database Schema
- [ ] Create table for users
- [ ] Create table for LLM Things
- [ ] Create table for LLM API responses

## Data Retention & Lifecycle
- [ ] Ensure all chat history always remains accessible via the link
- [ ] If an LLM Thing is deleted, keep its data in the database
- [ ] Later: add a first-use modal explaining that log data is kept for research purposes  
  - Logs are unbounded to the user’s email address

## Export & Data Access
- [ ] Provide a downloadable version containing:
  - Chat history (user + AI)
  - MQTT message history
- [ ] Use JSON as a baseline format  
  - Explore more readable alternatives

## Performance & Reliability
- [ ] Set up load testing

## Input & Interaction
- [ ] Implement microphone input
