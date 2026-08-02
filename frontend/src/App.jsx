import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import IngestPage from './features/ingest/IngestPage';
import GraphPage from './features/graph/GraphPage';
import QueryPage from './features/query/QueryPage';
import { ToastProvider } from './components/Toast';
import { HiOutlineCpuChip, HiOutlineDocumentText, HiOutlineShare, HiOutlineSparkles } from 'react-icons/hi2';
import './App.css';

function Nav() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
      isActive
        ? 'bg-brand-500/15 border border-brand-500/30 text-brand-400 shadow-sm'
        : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
    }`;

  return (
    <header className="h-[65px] px-6 flex items-center justify-between border-b border-surface-500/40 glass bg-surface-950/80 sticky top-0 z-50">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
          <HiOutlineCpuChip className="w-5 h-5" />
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight text-gray-100">Second Brain</span>
          <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
            GraphRAG OS
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex items-center gap-2">
        <NavLink to="/" end className={linkClass}>
          <HiOutlineDocumentText className="w-4 h-4" />
          Ingest & Library
        </NavLink>
        <NavLink to="/graph" className={linkClass}>
          <HiOutlineShare className="w-4 h-4" />
          Knowledge Graph
        </NavLink>
        <NavLink to="/query" className={linkClass}>
          <HiOutlineSparkles className="w-4 h-4" />
          AI Query Assistant
        </NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-surface-950 text-gray-100 font-sans selection:bg-brand-500/30 selection:text-brand-400">
            <Nav />
            <Routes>
              <Route path="/" element={<IngestPage />} />
              <Route path="/graph" element={<GraphPage />} />
              <Route path="/query" element={<QueryPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      </ToastProvider>
    </Provider>
  );
}
