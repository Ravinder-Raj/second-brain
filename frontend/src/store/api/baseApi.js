import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Single source of truth for the API base URL.
// Set VITE_API_BASE_URL in a .env file at the project root, e.g.:
//   VITE_API_BASE_URL=http://localhost:8000/api
const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  prepareHeaders: (headers) => {
    // Placeholder for auth — once login exists, pull the token from
    // wherever it's stored (redux state / localStorage) and attach it.
    const token = localStorage.getItem('authToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

// This is the ONE createApi instance for the whole app. Every feature's
// *Api.js file injects its endpoints into this instance (see ingestApi.js,
// graphApi.js, queryApi.js) instead of calling createApi again.
// Why: one cache, one middleware, one place to configure baseUrl/auth —
// avoids duplicate network layers and makes cross-feature cache
// invalidation (tagTypes) actually work.
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Documents', 'GraphData', 'QueryHistory'],
  endpoints: () => ({}),
});
