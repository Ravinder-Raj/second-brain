# 🧠 Second Brain — GraphRAG Knowledge OS

A production-grade, GraphRAG-powered personal knowledge assistant built with **FastAPI**, **React 19**, **Neo4j AuraDB**, **NVIDIA NIM LLMs**, and **AWS Infrastructure**.

---

## 🚀 Key Features

- **AI Query Assistant**: 
  - **Discover Mode**: Broad pattern finding and community summary synthesis across all ingested documents.
  - **Connect Mode**: Relates new queries to specific entities and existing knowledge relationships.
  - **Challenge Mode**: Devil's advocate reasoning to surface contradictions, weak assumptions, and critical questions.
  - **Real-Time Streaming**: Low-latency Server-Sent Events (SSE) streaming powered by **NVIDIA NIM (Llama-3.1 8B Instruct)**.

- **Document Ingestion Pipeline**:
  - Supports **PDF documents** (text extraction via `pypdf`), **Plain Text**, and **Web URLs** (content scraping via `httpx` + `trafilatura`).
  - Asynchronous background processing via AWS SQS worker queue.

- **Interactive Knowledge Graph**:
  - Visualizes entities, communities, and relationships using **Cytoscape.js**.
  - Direct Cypher graph storage in **Neo4j Aura Cloud Database**.

---

## 🛠️ Architecture Stack

```
                     ┌───────────────────────────────┐
                     │    React 19 + Redux + Vite    │
                     │  (S3 Static Website Hosting)   │
                     └───────────────┬───────────────┘
                                     │
                             HTTP / SSE Streaming
                                     │
                     ┌───────────────▼───────────────┐
                     │     FastAPI Backend (ECS)     │
                     └───────┬───────────────┬───────┘
                             │               │
            ┌────────────────┴┐             ┌┴────────────────┐
            │   Neo4j Aura   │             │   NVIDIA NIM    │
            │ (Graph Database)│             │ (Llama 3.1 8B)  │
            └─────────────────┘             └─────────────────┘
```

- **Frontend**: React 19, Redux Toolkit, React Router v7, TailwindCSS, Cytoscape.js, React Markdown.
- **Backend**: FastAPI, Python 3.11/3.12, LangChain, Microsoft GraphRAG 0.3.6, Neo4j Driver, LanceDB.
- **Infrastructure**: AWS ECS (Fargate), Amazon ECR, AWS S3, AWS SQS, AWS Secrets Manager, GitHub Actions.

---

## 🔄 Automated CI/CD (Push to Deploy)

You **do not need to run manual AWS commands** to deploy changes. Pushing code to GitHub automatically deploys both the backend and frontend live!

### How to Deploy via Git

Whenever you want to deploy code updates, simply run:

```bash
git add .
git commit -m "feat: your change description"
git push origin main
```

That's it! GitHub Actions takes over automatically.

---

### 🔑 One-Time GitHub Secrets Configuration

To enable automated deployment, add your AWS credentials to your GitHub Repository:

1. Go to your repository on GitHub: **`https://github.com/Ravinder-Raj/second-brain`**
2. Click **Settings** ➔ **Secrets and variables** ➔ **Actions**.
3. Click **New repository secret** and add:
   - **`AWS_ACCESS_KEY_ID`**: Your AWS IAM Access Key ID
   - **`AWS_SECRET_ACCESS_KEY`**: Your AWS IAM Secret Access Key

---

### What the CI/CD Pipeline Automates:

1. **Backend Deployment**:
   - Builds the backend Docker container (`Dockerfile`).
   - Pushes the image to **Amazon ECR** (`second-brain-backend:latest`).
   - Triggers a forced deployment on **AWS ECS Fargate**.
   - Dynamically retrieves the newly assigned Public IP.

2. **Frontend Deployment**:
   - Injects the active ECS backend API URL into Vite build variables (`VITE_API_BASE_URL`).
   - Builds the production bundle (`npm run build`).
   - Syncs static assets directly to the live **AWS S3 Bucket** (`second-brain-frontend-rr319918`).

---

## 💻 Local Development Setup

### 1. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | ECS Health check & Neo4j connectivity status |
| `POST` | `/api/query` | Streams LLM answers via Server-Sent Events (SSE) |
| `GET` | `/api/query/modes` | Returns available query modes (Discover, Connect, Challenge) |
| `POST` | `/api/ingest/upload` | Accepts PDF, TXT, or URL for async indexing |
| `GET` | `/api/ingest/status/{job_id}` | Polls indexing status of a queued document |
| `GET` | `/api/ingest/documents` | Lists all ingested documents in the knowledge base |
| `GET` | `/api/graph/full` | Returns full graph nodes and relationships for Cytoscape.js |
