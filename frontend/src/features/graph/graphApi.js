import { baseApi } from '../../store/api/baseApi';

export const graphApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /api/graph/full
    getFullGraph: builder.query({
      query: () => '/graph/full',
      providesTags: ['GraphData'],
    }),

    // POST /api/graph/subgraph — expects body { entity_names: string[] }
    getSubgraph: builder.query({
      query: (params) => {
        let entityNames = [];
        if (Array.isArray(params)) {
          entityNames = params;
        } else if (params?.entity_names) {
          entityNames = params.entity_names;
        } else if (params?.rootNodeId) {
          entityNames = [params.rootNodeId];
        }
        return {
          url: '/graph/subgraph',
          method: 'POST',
          body: { entity_names: entityNames },
        };
      },
    }),

    // GET /api/graph/search?q=
    searchEntities: builder.query({
      query: (searchTerm) => ({
        url: '/graph/search',
        params: { q: searchTerm },
      }),
    }),
  }),
});

export const {
  useGetFullGraphQuery,
  useGetSubgraphQuery,
  useSearchEntitiesQuery,
} = graphApi;
