import { baseApi } from '../../store/api/baseApi';

export const ingestApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Handles FormData (file, url, plain_text, title) or raw file
    uploadDocument: builder.mutation({
      query: (formDataOrFile) => {
        let body = formDataOrFile;
        if (formDataOrFile instanceof File) {
          body = new FormData();
          body.append('file', formDataOrFile);
        }
        return {
          url: '/ingest/upload',
          method: 'POST',
          body,
        };
      },
      invalidatesTags: ['Documents'],
    }),

    // Legacy alias for uploadDocument
    uploadFile: builder.mutation({
      query: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return {
          url: '/ingest/upload',
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: ['Documents'],
    }),

    getJobStatus: builder.query({
      query: (jobId) => `/ingest/status/${jobId}`,
    }),

    getDocuments: builder.query({
      query: () => '/ingest/documents',
      providesTags: ['Documents'],
    }),

    deleteDocument: builder.mutation({
      query: (docId) => ({
        url: `/ingest/${docId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Documents', 'GraphData'],
    }),
  }),
});

export const {
  useUploadDocumentMutation,
  useUploadFileMutation,
  useGetJobStatusQuery,
  useGetIngestStatusQuery = ingestApi.useGetJobStatusQuery,
  useGetDocumentsQuery,
  useListDocumentsQuery = ingestApi.useGetDocumentsQuery,
  useDeleteDocumentMutation,
} = ingestApi;
