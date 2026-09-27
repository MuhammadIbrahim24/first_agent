# Finance Assistant

This project contains a personal finance assistant with two entry points:

- `finance_cli.js` - interactive terminal-based chat
- `finance_api.js` - HTTP API endpoint for prompt-based requests

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your environment variables in a `.env` file:
   ```env
   GROQ_API_KEY=your_groq_api_key
   TAVILY_API_KEY=your_tavily_api_key
   ```

## Run the CLI

```bash
npm run dev
```

## Run the API

```bash
npm run dev:rest
```

The API listens on:

```http
POST /prompt
```

Example request body:

```json
{
  "threadId": "chat-123",
  "prompt": "How much have I spent this month?"
}
```

Example response:

```json
{
  "response": "You have spent ..."
}
```

## Notes

- The assistant supports expense tracking and web search tools.
- Requests are tracked per `threadId` using an in-memory cache.
- This project is meant for local development and testing.
