import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import ingestReducer from '../features/ingest/ingestSlice';
import graphReducer from '../features/graph/graphSlice';
import queryReducer from '../features/query/querySlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer, // RTK Query's own cache slice
    ingest: ingestReducer, // local UI state for the ingest feature
    graph: graphReducer, // local UI state for the graph feature
    query: queryReducer, // local UI state + streaming answer for the query feature
  },
  // RTK Query needs its middleware wired in for caching, refetching,
  // polling, and cache invalidation to work.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});
