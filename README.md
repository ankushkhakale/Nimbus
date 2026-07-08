# ☁️ Nimbus

Built with a modern, cloud-native architecture, Nimbus is designed to be storage-provider agnostic, allowing you to use AWS S3, Google Cloud Storage, MinIO, and other S3-compatible object storage solutions. It aims to provide a privacy-focused, self-hostable alternative to traditional cloud storage services.

## 🚀 Tech Stack

- **Frontend**: Next.js (React), Tailwind CSS, Lucide Icons, Glassmorphism UI
- **Backend**: FastAPI (Python 3.13), Motor (Async MongoDB), Pydantic
- **Database**: MongoDB
- **Infrastructure**: Docker & Docker Compose

## 🎯 Vision

Own your cloud. Own your data.

## 🚧 Project Status: Active Development

### ✨ Implemented Features
- [x] Docker-based deployment configuration
- [x] FastAPI Backend Foundation (Clean Architecture)
- [x] Asynchronous MongoDB Integration
- [x] Next.js Frontend Foundation with Glassmorphism UI
- [x] High-end Landing Page & Responsive Bento Grid
- [x] Authentication UI (Login, Register, Forgot Password with OAuth Buttons)

### 📋 Planned Features
- [ ] Implement robust Backend Authentication (JWT, OAuth)
- [ ] Multi-cloud object storage integration (MinIO/S3)
- [ ] 📁 File & Folder management
- [ ] 🖼️ Photo gallery & processing
- [ ] 🔍 AI-powered semantic search & tagging
- [ ] 🔄 Automatic backups & cross-device sync
- [ ] 📱 Progressive Web App (PWA) support

## 🛠️ Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js (for local frontend development)
- Python 3.13+ (for local backend development)

### Running with Docker
You can easily spin up the entire application using Docker Compose:

```bash
docker compose up -d --build
```
- Backend API will be available at `http://localhost:8000`
- Frontend UI will be available on the corresponding port configured (e.g., `http://localhost:3000`)

---
*Note: Project development may occasionally be delayed due to college assignments and exams. 😭*
