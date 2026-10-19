# Platform API access control

Matches the Amart control contract. Set a strong, private `CON_SECRET` in the backend `.env` and restart the process. Never include this secret in frontend builds or URLs.

Block HTTP APIs:

```bash
curl --fail-with-body -H "X-Platform-Control-Key: $CON_SECRET" https://api.sevabazar.com/platform-access/true
```

Restore HTTP APIs:

```bash
curl --fail-with-body -H "X-Platform-Control-Key: $CON_SECRET" https://api.sevabazar.com/platform-access/false
```

Only GET is accepted, matching Amart. The control endpoint stays reachable while blocked. Other HTTP requests return status 503 and `{"message":"Network error"}`. State is stored in MongoDB and survives process restarts. A missing record defaults to enabled; database read failures fail closed. A missing secret disables control changes.

The gate runs before CORS, body parsing, static uploads, and all application routes. Like Amart, this controls HTTP APIs; it does not stop cron jobs, existing in-flight work, Socket.IO traffic, or the separately hosted admin static page. Each HTTP request reads the shared database state.

Run tests with `node --test tests/platform-access.test.js`. Tests use an isolated fake store and never block the deployed platform.
