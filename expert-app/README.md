# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Running against the Data Peaks backend

1. Backend (repo root): `venv/Scripts/python.exe -m pip install -r backend/requirements.txt`, then `cd backend && ../venv/Scripts/python.exe -m app.seed` and `../venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`.
2. This app: `npm install` then `npm run dev -- --port 8080` and open http://localhost:8080.

`/api/*` is proxied to http://localhost:8000 (override with `API_PROXY_TARGET`), so no CORS change is needed.
The expert link defaults to `demo-expert-a`; open `http://localhost:8080/?token=demo-expert-b` to use another seeded expert.
Data layer: `src/lib/api.ts` (HTTP client) and `src/components/datapeaks/useExpert.ts` (state + actions).
