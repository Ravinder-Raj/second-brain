/**
 * StreamingMessage — renders a single LLM response with markdown.
 *
 * While streaming, shows a typing cursor animation.
 * After completion, renders full markdown with react-markdown.
 *
 * Props:
 *   - content: the markdown text to render
 *   - isStreaming: whether tokens are still arriving
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function StreamingMessage({ content, isStreaming }) {
  if (!content) return null;

  return (
    <div
      className={`prose-chat text-sm leading-relaxed ${
        isStreaming ? "typing-cursor" : ""
      }`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
