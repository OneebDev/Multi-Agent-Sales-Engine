# 🚀 Multi-Agent Sales Engine

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

# Multi-Agent Sales & Intelligence Engine (v17.2)

An advanced AI-powered platform for multi-agent business intelligence, high-precision lead generation, and professional job hunting.

## 🚀 Key Features

- **🎯 Precision Job Hunter (v17.0+)**: Uses AI "Role Critic" and HTML-based scans to find active, exact-match jobs across LinkedIn, Indeed, and Glassdoor.
- **🛡️ Multi-Source Reliability**: Parallel fetching with diversity enforcement ensures you never miss a lead or a listing.
- **🔍 Deep Research Agent**: Multi-step terminal-driven research for comprehensive market intelligence.
- **⚡ Supercharged Leads**: High-confidences lead generation with fallback mechanisms for 100% data availability.
- **🧠 Zero-Crash Architecture**: Bulletproof state machines and parallel backoff logic to ensure 24/7 uptime.

---

## 🧠 The Agent Trimvirate

Our system relies on three specialized agents working in a seamless pipeline:

| Agent | Icon | Role | Key Skill |
| :--- | :---: | :--- | :--- |
| **The Researcher** | 🔍 | Deep Search Orchestrator | Query Expansion, Web/Paper/YT Search, RAG |
| **The Crawler** | 🕷️ | Precision Extraction | Domain filtering, B2B scraping, Email extraction |
| **The Critic** | ⚖️ | Quality Assurance | Hallucination detection, Gap Analysis, Lead Scoring |

---

## ✨ Features

- **Multi-Source Research**: Fetches data from Google (Serper), Academic Papers, News, and YouTube simultaneously.
- **Agentic RAG**: Implements Retrieval-Augmented Generation with a local vector store for context-perfect responses.
- **Real-Time Pipelines**: Watch agents work in real-time with live progress updates via Socket.io.
- **Business Gap Analysis**: AI-driven analysis of company websites to identify missing services and revenue potential.
- **Personalized Outreach**: Automatically generates context-aware cold emails for each lead.
- **Reliable Task Handling**: Powered by **BullMQ** and **Redis** for robust background processing.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Zustand.
- **Backend**: Node.js, Express, TypeScript.
- **Queuing**: Redis + BullMQ.
- **Database**: MongoDB (Mongoose).
- **AI/LLM**: Groq (Llama 3/3.1), Serper API, YouTube Data API.

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- API Keys: Groq, Serper, YouTube.

### Quick Start (Docker)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/OneebDev/Multi-Agent-Sales-Engine.git
   cd Multi-Agent-Sales-Engine
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory (refer to `.env.example`).

3. **Spin up the stack**:
   ```bash
   docker-compose up --build
   ```

The application will be available at `http://localhost`.

---

## ⚙️ Environment Variables

> [!IMPORTANT]
> Ensure these keys are set in your `.env` for the agents to function correctly.

| Variable | Description |
| :--- | :--- |
| `GROQ_API_KEY` | Your Groq API key for LLM inference. |
| `SERPER_API_KEY` | Required for web and company search. |
| `YOUTUBE_API_KEY` | Required for video research. |
| `DATABASE_URL` | MongoDB connection string. |
| `REDIS_HOST` | Redis host for task queuing. |

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by OneebDev
</p>
