# VVWU Campus Recruitment Portal — Frontend

Independent single-page web application built with **React**, **Vite**, and **Tailwind CSS** for the VVWU Campus Recruitment Portal.

## Architecture

- **Framework**: React 18
- **Tooling**: Vite 5
- **Styling**: Tailwind CSS + Custom Design System Tokens (matching original brand style: Navy `#102e5f`, Teal `#087c91`, Canvas `#f4f7fb`)
- **State Management**: React Context (`AuthContext`, `ToastContext`)
- **Routing**: Dynamic Hash Router (`#/login`, `#/dashboard`, `#/users`, etc.)
- **API Communication**: Centralized HTTP client in `src/services/api.js`

## Setup & Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Preview production build:
   ```bash
   npm run preview
   ```
