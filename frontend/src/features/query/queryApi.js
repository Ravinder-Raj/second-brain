import { baseApi } from '../../store/api/baseApi';
import {
  startStreaming,
  appendStreamingChunk,
  setStreamingError,
  finishStreaming,
} from './querySlice';

export const queryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getQueryModes: builder.query({
      query: () => '/query/modes',
      providesTags: ['QueryHistory'],
    }),
  }),
});

export const { useGetQueryModesQuery } = queryApi;

/**
 * Executes a streaming POST query to /api/query and dispatches SSE updates into Redux.
 */
export async function sendQueryStream({ question, mode = 'discover', doc_ids = null }, dispatch, signal) {
  dispatch(startStreaming(question));

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
    const response = await fetch(`${apiBase}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, mode, doc_ids }),
      signal,
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
      dispatch(setStreamingError(detail));
      dispatch(finishStreaming());
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
            dispatch(appendStreamingChunk(payload.content));
          } else if (payload.type === 'error') {
            dispatch(setStreamingError(payload.content || 'An error occurred while generating the answer.'));
          }
        } catch {
          dispatch(appendStreamingChunk(payloadStr));
        }
      }
    }

    // Process any remaining buffer after stream finishes
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const payloadStr = trimmed.replace(/^data:\s*/, '');
        try {
          const payload = JSON.parse(payloadStr);
          if (payload.type === 'chunk') {
            dispatch(appendStreamingChunk(payload.content));
          } else if (payload.type === 'error') {
            dispatch(setStreamingError(payload.content));
          }
        } catch {
          dispatch(appendStreamingChunk(payloadStr));
        }
      }
    }

    dispatch(finishStreaming());
  } catch (err) {
    if (err.name !== 'AbortError') {
      dispatch(setStreamingError(err.message || 'Stream connection failed'));
      dispatch(finishStreaming());
    }
  }
}

