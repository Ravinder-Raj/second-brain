import { baseApi } from '../../store/api/baseApi';

export const queryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    askQuestion: builder.query({
      queryFn: () => ({ data: { answer: '', done: false, error: null } }),

      async onCacheEntryAdded(
        { question, mode = 'discover', doc_ids = null },
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        await cacheDataLoaded;
        const controller = new AbortController();

        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
          const response = await fetch(`${apiBase}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, mode, doc_ids }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errText = await response.text();
            let detail = `HTTP ${response.status}`;
            try {
              const errObj = JSON.parse(errText);
              detail = errObj.detail || detail;
            } catch {
              detail = errText || detail;
            }
            updateCachedData((draft) => {
              draft.error = detail;
              draft.done = true;
            });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const frames = buffer.split('\n\n');
            buffer = frames.pop() || ''; // keep remaining incomplete frame in buffer

            for (const frame of frames) {
              const trimmed = frame.trim();
              if (!trimmed.startsWith('data:')) continue;

              const payloadStr = trimmed.replace(/^data:\s*/, '');
              if (!payloadStr) continue;

              try {
                const payload = JSON.parse(payloadStr);
                if (payload.type === 'chunk') {
                  updateCachedData((draft) => {
                    draft.answer += payload.content;
                  });
                } else if (payload.type === 'done') {
                  updateCachedData((draft) => {
                    draft.done = true;
                  });
                } else if (payload.type === 'error') {
                  updateCachedData((draft) => {
                    draft.error = payload.content || 'An error occurred while generating the answer.';
                    draft.done = true;
                  });
                }
              } catch {
                // Raw string fallback
                updateCachedData((draft) => {
                  draft.answer += payloadStr;
                });
              }
            }
          }

          updateCachedData((draft) => {
            draft.done = true;
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            updateCachedData((draft) => {
              draft.error = err.message || 'Stream connection failed';
              draft.done = true;
            });
          }
        }

        await cacheEntryRemoved;
        controller.abort();
      },
    }),

    getQueryModes: builder.query({
      query: () => '/query/modes',
      providesTags: ['QueryHistory'],
    }),
  }),
});

export const { useAskQuestionQuery, useGetQueryModesQuery } = queryApi;
