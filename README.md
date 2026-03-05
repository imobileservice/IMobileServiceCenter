# IMobile Service Center

Welcome to the IMobile Service Center project! This repository contains the source code for the IMobile Service Center web application and its accompanying backend services.

## Prerequisites

Before running the project, please make sure you have the following installed on your local machine:
1. **Node.js** (v18 or higher recommended) - [Download here](https://nodejs.org/)
2. **npm** (comes with Node.js) or **yarn** or **pnpm**
3. **Git** - [Download here](https://git-scm.com/)

## Getting Started

Follow these steps to set up and run the project locally.

### 1. Clone the Repository

First, clone the repository to your local machine:

```bash
git clone https://github.com/imobileservice/IMobileServiceCenter.git
cd "IMobileServiceCenter"
```

### 2. Install Dependencies

Install the required packages for the frontend and backend:

```bash
npm install
```

### 3. Environment Variables Setup

You need to configure the environment variables for the application to connect to external services like the database (Supabase).

1. In the root directory, look for a `.env.example` file.
2. Create a copy of it and name it exactly `.env`.
3. Open the `.env` file and make sure the Supabase keys are provided (they should already be populated in the example configuration for development purposes, but you can update them if you have your own testing instance).

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SITE_URL=http://localhost:5173
```

### 4. Running the Development Server

This project consists of two parts: a React frontend built with Vite, and an Express backend server. You need to run **both** to use the full application locally.

Open **two separate terminal windows or tabs** in the project directory.

**Terminal 1 (Backend Server):**
Start the backend server:
```bash
npm run dev:server
```
*(This starts the backend API on its default port, typically port 3001 or 5000).*

**Terminal 2 (Frontend App):**
Start the frontend interface:
```bash
npm run dev
```
*(This will start the local Vite development server).*

### 5. Accessing the Application

Once both servers are running, the frontend terminal will display a local URL, typically:
👉 **[http://localhost:5173](http://localhost:5173)**

Open that URL in your web browser to view the application!

---

## Building for Production

To create an optimized production build of the application:

```bash
npm run build:all
```
This command builds both the frontend React application and the backend server.

## Technologies Used
- **Frontend**: React, Vite, Tailwind CSS, Radix UI, Framer Motion
- **Backend**: Node.js, Express, TypeScript
- **Database / Auth**: Supabase

---
*If you encounter any issues during setup, please contact the development team for support.*
