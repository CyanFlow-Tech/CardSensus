# 🃏 CardSensus: Light Up Your Life Skill Tree

🌐 Language: [中文](../README.md) | **English**

<div align="left">
<img src="https://img.shields.io/badge/React-gray?logo=react" alt="React">
<img src="https://img.shields.io/badge/Typescript-gray?logo=typescript" alt="Typescript">
<img src="https://img.shields.io/badge/Vite-gray?logo=vite" alt="Vite">
<img src="https://img.shields.io/badge/FastAPI-gray?logo=fastapi" alt="FastAPI">
<img src="https://img.shields.io/github/license/CyanFlow-Tech/Aura" alt="License">
</div>

<img src="demo.png" width="100%">

## 💡 TL;DR

Real life has no progress bar, so CardSensus builds one for you. Turn your hobbies, expertise, and hard-earned lessons into glowing cards. Here, life becomes an RPG with an infinitely branching skill tree.

## 🌍 Even Life Deserves Level-Up Thrills

We have all felt this anxiety and regret:

You bought expensive fishing gear, joined a baking class you quit in a week, bookmarked dozens of “learn it in one go” editing tutorials, or even wrestled through cryptic lines of code. Over time, those experiences scatter in memory. It becomes hard to clearly show yourself or others: “What am I actually good at? Where are my skill boundaries? How far am I from mastery?”

CardSensus exists to end that “fog of life.”

We fully gamify boring learning records. Whether it is hardcore academic knowledge or everyday life skills full of human warmth, everything can be forged into cards. Every cooking session, every cast, every focused deep dive becomes XP that lights up this massive “life tech tree.”

## 🔥 Core Gameplay

1. **🃏 Card Everything**: Do not let the word “tech” limit your imagination. In CardSensus, “Python automation” is a card, “lure fishing” is a card, and even “Wellington steak crafting” is a card. The front side shows your proficiency and total invested time. The back side engraves your personal “first unlock” memory (for example: “Unlocked during a weekend camping trip”).

2. **👑 No Central Authority, Rarity Comes from Consensus (Crowdsourced Rarity)**: Who decides which skills are more valuable? Not the platform, but the players of Earth Online. Cards are ranked Common, Rare, Epic, and Legendary. Rarity is dynamically calculated from crowdsourced data across players: the fewer people who achieve it and the more average time it takes, the rarer it becomes. Want to flex? Show off that “Deep Sea Boat Fishing Master” legendary card unlocked by only 5% of players.

3. **⚔️ Build Your Own Life Archetype (Skill Decks)**: A single card can join a vast skill tree, and cards can also be freely combined into decks. You can bundle a deck named “Michelin Home Chef,” or share one called “Hardcore Digital Nomad Survival.” New players can one-click fork veteran decks and follow proven paths to unlock their own high-tier trees.

## 🚀 Future Vision

We are not just building another note-taking tool. We are building a new kind of high-dimensional social identity.

Imagine this: in the near future, you can pin a dynamically generated SVG card from CardSensus on your personal site, blog, or social feed. Instead of boring text intros, it showcases your proudest “life archetype deck” and your glowing “legendary skill nodes.”

That is the romance of top-tier players.

## 🛠️ For Developers & Early Players

The CardSensus core engine is already up and running, and it fully supports building this multimodal skill graph. You can launch it locally right now and enjoy the thrill of “topology editing” and “deck crafting”:

- [x] Silk-smooth infinite skill canvas: supports complex DAG topology and auto-layout.
- [x] Card alchemy workshop: define your own skills freely and connect upstream/downstream dependencies in one click.
- [x] Hacker-friendly data flow: JSON-driven foundation with draft import and full graph export, ready for future graph database integration.
- [x] End-to-end frontend/backend integration is online: FastAPI serves graph and entity APIs, React canvas consumes and renders skill relations in real time.
- [x] Asset system is mount-ready: backend already exposes `/files` static resources, so card images and demo assets work locally out of the box.

### 📦 Repository Structure

```text
CardSensus/
├─ backend/                        # FastAPI backend service
│  ├─ src/roadmap/                 # Core business layers (domain/application/infrastructure/presentation)
│  ├─ data/                        # Local data and file assets
│  ├─ scripts/                     # Utility scripts
│  ├─ main.py                      # Backend entrypoint
│  ├─ requirements.txt
│  └─ pyproject.toml
├─ frontend/                       # React + Vite frontend
│  ├─ src/app/                     # App-level entry and route composition
│  ├─ src/pages/                   # Page layer
│  ├─ src/widgets/                 # Page-level widgets
│  ├─ src/features/                # Feature modules
│  ├─ src/entities/                # Domain entities
│  ├─ src/shared/                  # Shared capabilities (api/lib/ui)
│  └─ src/styles/                  # Global styles
├─ docs/                           # Documentation and demo assets
├─ tools/                          # Auxiliary tools (e.g., ImageGen)
├─ package.json                    # Root workspace scripts
└─ README.md
```

### ⚡ Quick Start (Local Setup)

Backend Engine (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=src uvicorn main:app --reload
# 🚀 Engine ignition at http://127.0.0.1:8000
```

Frontend Canvas (React + Vite)

```bash
cd frontend
npm install
npm run dev
# 🎨 Your canvas is live at http://127.0.0.1:5173
```

### 🧪 Developer Debug Panel (Optional but Highly Recommended)

After the backend engine is online, open FastAPI's built-in API panels to quickly verify that each “life skill card” flows as expected:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Health check: `http://127.0.0.1:8000/health`

### 🧰 Common Dev Scripts

Some “gear” is already in this repo, ready to boost your CardSensus development workflow:

- `backend/scripts/generate_card_images.py`: batch-generate/update card image assets.
- `backend/scripts/test_llm_service.py`: quickly verify LLM-related service paths.
- `tools/ImageGen/`: image generation tool directory, good as a starting point for an asset pipeline.
