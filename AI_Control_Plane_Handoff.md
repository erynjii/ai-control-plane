# 🧠 AI Control Plane — Project Handoff Summary

## 📌 Overview

The AI Control Plane is a web application designed to:

> **control, govern, and track AI-generated content workflows**

Core idea:
- Centralize AI usage
- Add **security + approval layers**
- Provide **visibility into content creation and usage**

---

## 🎯 MVP Scope (Current State)

The application currently implements the **UI + partial workflow foundation** for:

Generate → Scan → Approve → Publish → Track

### Current Status

| Area | Status |
|------|--------|
| UI Dashboard | ✅ Working |
| AI Workspace (input + generate button) | ✅ Built |
| Auth (Supabase) | ⚠️ Implemented but bypassed |
| Dev Mode Dashboard | ✅ Active |
| API Generation | ⚠️ Partially scaffolded |
| Database | ❌ Not wired yet |
| Scan Engine | ❌ Not built |
| Approval Workflow | ❌ Not built |
| Publishing | ❌ Not built |

---

## 🏗️ Architecture

### Frontend
- Framework: Next.js (App Router)
- Language: TypeScript
- UI: Tailwind CSS

### Structure
/app/dashboard → main product surface  
/components/dashboard → UI components  

---

### Backend (in-progress)
- Next.js API routes (/app/api/...)
- OpenAI integration via server routes (planned)

---

### Auth
- Supabase Auth (magic link)
- Currently bypassed for development

---

## 🧩 Key Components

### Dashboard (/app/dashboard/page.tsx)
- Main application UI
- Currently running in dev mode (no auth enforcement)

### AI Workspace (components/dashboard/ai-workspace.tsx)
- Prompt input
- Model selector
- Generate button
- Will connect to /api/generate

### Sidebar
- Navigation (currently static string array)

### Panel Cards
- Prompt Compliance Scanner
- Content Approval Queue
- Creation Audit Trail
- Revenue Insights

---

## 🔌 Environment Variables

### Required (Production)

OPENAI_API_KEY=  
NEXT_PUBLIC_SUPABASE_URL=  
NEXT_PUBLIC_SUPABASE_ANON_KEY=  

### Optional (Development Only)

NEXT_PUBLIC_DEV_AUTH_BYPASS=true  

---

## ⚠️ Known Issues / Decisions

### Auth is intentionally bypassed
- Avoids development friction
- Will be reintroduced later

### No persistence yet
- No DB schema
- No saved assets

### OpenAI not fully wired
- UI ready
- API incomplete

---

## 🚀 Deployment Strategy (Vercel)

- Root Directory: ai-control-plane
- Framework: Next.js

Steps:
1. Push repo
2. Import to Vercel
3. Set env vars
4. Deploy
5. Debug via Vercel logs

---

## 🧭 Next Steps

### Phase 1
- Wire API generation
- Display output

### Phase 2
- Add DB (assets table)

### Phase 3
- Add scan + risk levels

### Phase 4
- Approval workflow

### Phase 5
- Publishing integrations

---

## 💡 Core Insight

This is:

> An enterprise control layer for AI usage

Not just a content tool.

---

## 📦 Status

- Ready for deployment
- Mid-MVP
- Needs execution on core loop

---

## 🔚 Bottom Line

You have:
- Working UI
- Defined architecture
- Clear roadmap

Missing:
- Generation
- Storage
- Control logic
