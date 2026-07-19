import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import IngestPage from './features/ingest/IngestPage';
import GraphPage from './features/graph/GraphPage';
import QueryPage from './features/query/QueryPage';
import './App.css';

// Simple top nav — swap classNames for your actual Tailwind styling.
function Nav() {
  const linkClass = ({ isActive }) =>
    isActive ? 'font-semibold underline' : 'text-gray-400';

  return (
    <nav className="flex gap-6 p-4 border-b border-gray-800">
      <NavLink to="/" end className={linkClass}>Ingest</NavLink>
      <NavLink to="/graph" className={linkClass}>Graph</NavLink>
      <NavLink to="/query" className={linkClass}>Query</NavLink>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<IngestPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/query" element={<QueryPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
