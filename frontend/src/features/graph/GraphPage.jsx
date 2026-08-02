import { useState, useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineCube,
  HiOutlineShare,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlineArrowPath,
} from 'react-icons/hi2';

import { useGetFullGraphQuery, useGetSubgraphQuery, useSearchEntitiesQuery } from './graphApi';
import { selectNode, clearSelection, setSearchQuery } from './graphSlice';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';

export default function GraphPage() {
  const dispatch = useDispatch();
  const { selectedNodeId, selectedNodeData, searchQuery } = useSelector((s) => s.graph);
  const [searchInput, setSearchInput] = useState('');
  const [activeLayout, setActiveLayout] = useState('cose');

  // Fetch full graph from Neo4j
  const { data: fullGraph, isLoading, refetch } = useGetFullGraphQuery();

  // Search entities
  const { data: searchResults } = useSearchEntitiesQuery(searchQuery, {
    skip: !searchQuery || searchQuery.trim().length < 2,
  });

  // Fetch subgraph around selected node
  const { data: subgraph } = useGetSubgraphQuery(selectedNodeId, {
    skip: !selectedNodeId,
  });

  // Cytoscape styles
  const stylesheet = useMemo(() => [
    {
      selector: 'node',
      style: {
        'label': 'data(name)',
        'background-color': '#06b6d4',
        'color': '#f3f4f6',
        'font-size': '11px',
        'font-weight': 500,
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'width': 28,
        'height': 28,
        'border-width': 2,
        'border-color': '#0a0e1a',
        'transition-property': 'background-color, line-color, target-arrow-color',
        'transition-duration': '0.2s',
      },
    },
    {
      selector: 'node[type = "PERSON"]',
      style: { 'background-color': '#8b5cf6' },
    },
    {
      selector: 'node[type = "ORGANIZATION"]',
      style: { 'background-color': '#3b82f6' },
    },
    {
      selector: 'node[type = "CONCEPT"]',
      style: { 'background-color': '#06b6d4' },
    },
    {
      selector: 'node[type = "TECHNOLOGY"]',
      style: { 'background-color': '#10b981' },
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': 'rgba(255, 255, 255, 0.15)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'rgba(255, 255, 255, 0.15)',
        'arrow-scale': 0.8,
      },
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#f59e0b',
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'border-width': 3,
        'border-color': '#ffffff',
      },
    },
  ], []);

  // Format elements for Cytoscape.js
  const elements = useMemo(() => {
    if (!fullGraph) return [];
    const nodes = (fullGraph.nodes || []).map((n) => {
      const data = n.data || n;
      return {
        data: {
          id: data.id,
          name: data.name || data.id,
          type: data.type || 'CONCEPT',
          description: data.description || '',
        },
      };
    });

    const edges = (fullGraph.edges || []).map((e, idx) => {
      const data = e.data || e;
      return {
        data: {
          id: `edge-${idx}`,
          source: data.source,
          target: data.target,
          label: data.rel_type || 'RELATES_TO',
        },
      };
    });

    return [...nodes, ...edges];
  }, [fullGraph]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    dispatch(setSearchQuery(searchInput));
  };

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-surface-950 relative">
      {/* Main Canvas Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Control Bar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl glass border border-surface-500/40 shadow-xl">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <HiOutlineMagnifyingGlass className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search entities (e.g. AI, Python, Architecture)..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface-900 border border-surface-500/50 text-xs text-gray-200 placeholder-gray-500 focus:border-brand-500"
              />
            </div>
            <Button variant="secondary" size="sm" type="submit">Search</Button>
          </form>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Layout:</span>
            {['cose', 'grid', 'circle', 'concentric'].map((layout) => (
              <button
                key={layout}
                onClick={() => setActiveLayout(layout)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium uppercase tracking-wider border transition-all ${
                  activeLayout === layout
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {layout}
              </button>
            ))}
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg bg-surface-800 text-gray-400 hover:text-gray-100 transition-colors"
              title="Refresh Graph"
            >
              <HiOutlineArrowPath className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Graph Canvas */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader size="lg" />
          </div>
        ) : elements.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={HiOutlineSparkles}
              title="Knowledge Graph Empty"
              description="Ingest documents to automatically extract entities and relationships into your graph."
            />
          </div>
        ) : (
          <div className="flex-1 w-full h-full">
            <CytoscapeComponent
              elements={elements}
              style={{ width: '100%', height: '100%', background: '#050810' }}
              layout={{ name: activeLayout, animate: true, animationDuration: 500 }}
              stylesheet={stylesheet}
              cy={(cy) => {
                cy.on('tap', 'node', (evt) => {
                  const node = evt.target;
                  dispatch(selectNode({
                    id: node.id(),
                    name: node.data('name'),
                    type: node.data('type'),
                    description: node.data('description'),
                  }));
                });
              }}
            />
          </div>
        )}

        {/* Search Results Overlay */}
        {searchResults?.results?.length > 0 && (
          <div className="absolute top-20 left-4 z-20 w-80 p-3 rounded-2xl glass border border-surface-500/50 shadow-2xl space-y-2 max-h-60 overflow-y-auto">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Search Results ({searchResults.total})</p>
            {searchResults.results.map((res) => (
              <div
                key={res.id}
                onClick={() => dispatch(selectNode(res))}
                className="p-2 rounded-xl bg-surface-900/80 hover:bg-brand-500/10 cursor-pointer text-xs space-y-1 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-200">{res.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-700 text-gray-400 uppercase">{res.type}</span>
                </div>
                <p className="text-[11px] text-gray-400 line-clamp-1">{res.description}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Selected Entity Drawer */}
      {selectedNodeId && (
        <aside className="w-80 h-full glass border-l border-surface-500/50 p-5 flex flex-col justify-between overflow-y-auto z-20 animate-slide-right">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HiOutlineCube className="w-5 h-5 text-brand-400" />
                <h2 className="text-sm font-semibold text-gray-100">Entity Details</h2>
              </div>
              <button
                onClick={() => dispatch(clearSelection())}
                className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-700"
              >
                <HiOutlineXMark className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-surface-900/80 border border-surface-500/40">
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-brand-500/20 text-brand-400">
                {selectedNodeData?.type || 'ENTITY'}
              </span>
              <h3 className="text-base font-semibold text-gray-100">
                {selectedNodeData?.name || selectedNodeId}
              </h3>
              {selectedNodeData?.description && (
                <p className="text-xs text-gray-300 leading-relaxed">
                  {selectedNodeData.description}
                </p>
              )}
            </div>

            {/* Subgraph neighborhood */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                <HiOutlineShare className="w-4 h-4 text-brand-400" />
                Graph Neighborhood ({subgraph?.nodes?.length || 0} Connected)
              </h4>
              {subgraph?.nodes?.length ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {subgraph.nodes.map((node, i) => (
                    <div key={i} className="p-2 rounded-lg bg-surface-800/60 text-xs text-gray-300 flex items-center justify-between">
                      <span>{node.data?.name || node.data?.id}</span>
                      <span className="text-[10px] text-gray-500">{node.data?.type}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No connected nodes found</p>
              )}
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => dispatch(clearSelection())}
          >
            Clear Selection
          </Button>
        </aside>
      )}
    </div>
  );
}
